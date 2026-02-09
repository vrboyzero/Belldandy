/**
 * Cron Scheduler - 定时任务调度引擎
 *
 * 每 TICK_INTERVAL_MS（30s）轮询检查所有 enabled 的 job，
 * 如果 nextRunAtMs ≤ now 则执行该任务。
 *
 * 支持：
 * - 活跃时段过滤（复用 Heartbeat 逻辑）
 * - 忙碌检测（防止插队）
 * - at 类型执行后自动 disable 或删除
 * - every 类型自动计算下次触发时间
 */

import type { CronJob } from "./types.js";
import { CronStore, computeNextRun } from "./store.js";

/** 调度器轮询间隔：30 秒 */
const TICK_INTERVAL_MS = 30_000;

/** 最大并发执行数（防止 tick 堆积） */
const MAX_CONCURRENT_RUNS = 3;

export interface CronSchedulerOptions {
    /** CronStore 实例 */
    store: CronStore;
    /** 发送消息到 Agent 并获取回复 */
    sendMessage: (prompt: string) => Promise<string>;
    /** 推送消息到用户渠道 */
    deliverToUser?: (message: string) => Promise<void>;
    /** 系统是否忙碌 */
    isBusy?: () => boolean;
    /** 活跃时段（如 { start: "08:00", end: "23:00" }） */
    activeHours?: { start: string; end: string };
    /** 用户时区 */
    timezone?: string;
    /** 日志函数 */
    log?: (message: string) => void;
}

export interface CronSchedulerHandle {
    /** 停止调度器 */
    stop: () => void;
    /** 获取当前状态 */
    status: () => CronSchedulerStatus;
}

export interface CronSchedulerStatus {
    running: boolean;
    totalJobs: number;
    enabledJobs: number;
    activeRuns: number;
    lastTickAtMs?: number;
}

export function startCronScheduler(options: CronSchedulerOptions): CronSchedulerHandle {
    const {
        store,
        sendMessage,
        deliverToUser,
        isBusy,
        activeHours,
        timezone,
        log = console.log,
    } = options;

    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let activeRuns = 0;
    let lastTickAtMs: number | undefined;

    // 活跃时段检查（复用 Heartbeat 的逻辑）
    const isWithinActiveHours = (now: number): boolean => {
        if (!activeHours) return true;

        const parseTime = (time: string): number | null => {
            const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
            if (!match) return null;
            const h = parseInt(match[1], 10);
            const m = parseInt(match[2], 10);
            if (h < 0 || h > 24 || m < 0 || m > 59) return null;
            if (h === 24 && m === 0) return 24 * 60;
            if (h === 24) return null;
            return h * 60 + m;
        };

        const startMin = parseTime(activeHours.start);
        const endMin = parseTime(activeHours.end);
        if (startMin === null || endMin === null) return true;

        let currentMin: number;
        try {
            const tz = timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
            const parts = new Intl.DateTimeFormat("en-US", {
                timeZone: tz,
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
            }).formatToParts(new Date(now));
            const map: Record<string, string> = {};
            for (const part of parts) {
                if (part.type !== "literal") map[part.type] = part.value;
            }
            currentMin = Number(map.hour) * 60 + Number(map.minute);
        } catch {
            const d = new Date(now);
            currentMin = d.getHours() * 60 + d.getMinutes();
        }

        if (endMin > startMin) {
            return currentMin >= startMin && currentMin < endMin;
        }
        // 跨午夜
        return currentMin >= startMin || currentMin < endMin;
    };

    // 执行单个 job
    const executeJob = async (job: CronJob, jobs: CronJob[]): Promise<void> => {
        const startedAt = Date.now();
        log(`[cron] 执行任务 "${job.name}" (${job.id})`);

        try {
            const response = await sendMessage(job.payload.text);

            job.state.lastRunAtMs = Date.now();
            job.state.lastDurationMs = Date.now() - startedAt;
            job.state.lastStatus = "ok";
            job.state.lastError = undefined;

            // 投递非空响应到用户
            const trimmed = response?.trim();
            if (trimmed && deliverToUser) {
                try {
                    await deliverToUser(`🕐 [Cron: ${job.name}] ${trimmed}`);
                    log(`[cron] 任务 "${job.name}" 完成并已投递 (${job.state.lastDurationMs}ms)`);
                } catch (deliverErr) {
                    const msg = deliverErr instanceof Error ? deliverErr.message : String(deliverErr);
                    log(`[cron] 任务 "${job.name}" 投递失败: ${msg}`);
                }
            } else {
                log(`[cron] 任务 "${job.name}" 完成 (${job.state.lastDurationMs}ms)`);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            job.state.lastRunAtMs = Date.now();
            job.state.lastDurationMs = Date.now() - startedAt;
            job.state.lastStatus = "error";
            job.state.lastError = message;
            log(`[cron] 任务 "${job.name}" 执行失败: ${message}`);
        }

        // 后处理：at 类型执行后处理
        if (job.schedule.kind === "at") {
            if (job.deleteAfterRun) {
                // 从列表中移除
                const idx = jobs.indexOf(job);
                if (idx !== -1) jobs.splice(idx, 1);
                log(`[cron] 一次性任务 "${job.name}" 已删除`);
            } else {
                job.enabled = false;
                job.state.nextRunAtMs = undefined;
                log(`[cron] 一次性任务 "${job.name}" 已禁用`);
            }
        } else {
            // every 类型：计算下次执行时间
            job.state.nextRunAtMs = computeNextRun(job.schedule, Date.now());
        }
    };

    // 调度 tick
    const tick = async (): Promise<void> => {
        if (stopped) return;

        const now = Date.now();
        lastTickAtMs = now;

        // 活跃时段检查
        if (!isWithinActiveHours(now)) {
            return;
        }

        // 忙碌检查
        if (isBusy?.()) {
            return;
        }

        // 加载任务列表
        let jobs: CronJob[];
        try {
            jobs = await store.list();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            log(`[cron] 加载任务失败: ${msg}`);
            return;
        }

        if (jobs.length === 0) return;

        // 筛选需要执行的任务
        const dueJobs = jobs.filter(
            (j) => j.enabled && j.state.nextRunAtMs !== undefined && j.state.nextRunAtMs <= now
        );

        if (dueJobs.length === 0) return;

        // 限制并发
        const toRun = dueJobs.slice(0, MAX_CONCURRENT_RUNS - activeRuns);
        if (toRun.length === 0) return;

        // 顺序执行（避免 Agent 并发问题）
        for (const job of toRun) {
            if (stopped) break;
            activeRuns++;
            try {
                await executeJob(job, jobs);
            } finally {
                activeRuns--;
            }
        }

        // 持久化状态
        try {
            await store.saveJobs(jobs);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            log(`[cron] 保存状态失败: ${msg}`);
        }
    };

    // 启动调度
    log(`[cron] scheduler started, tick interval: ${TICK_INTERVAL_MS / 1000}s`);
    timer = setInterval(() => {
        if (!stopped) {
            tick().catch((err) => {
                const msg = err instanceof Error ? err.message : String(err);
                log(`[cron] tick error: ${msg}`);
            });
        }
    }, TICK_INTERVAL_MS);

    return {
        stop: () => {
            stopped = true;
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
            log("[cron] scheduler stopped");
        },
        status: () => {
            // 同步获取状态（异步读 store 会阻塞，这里返回缓存值）
            return {
                running: !stopped,
                totalJobs: -1, // 需要异步读取，这里用 -1 表示未知
                enabledJobs: -1,
                activeRuns,
                lastTickAtMs,
            };
        },
    };
}
