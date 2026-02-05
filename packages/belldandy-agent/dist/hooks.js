/**
 * Belldandy 钩子系统
 *
 * 提供 13 种生命周期钩子，覆盖 Agent、消息、工具、会话、网关等场景。
 * 支持优先级排序、双执行模式（并行/顺序）、错误处理选项。
 */
/**
 * 钩子注册表
 *
 * 存储所有已注册的钩子处理函数。
 */
export class HookRegistry {
    hooks = [];
    /**
     * 注册钩子
     */
    register(registration) {
        this.hooks.push(registration);
    }
    /**
     * 注销钩子
     */
    unregister(source, hookName) {
        for (let i = this.hooks.length - 1; i >= 0; i--) {
            const hook = this.hooks[i];
            if (hook.source === source && (!hookName || hook.hookName === hookName)) {
                this.hooks.splice(i, 1);
            }
        }
    }
    /**
     * 获取指定名称的钩子（按优先级排序，高优先级在前）
     */
    getHooks(hookName) {
        return this.hooks
            .filter((h) => h.hookName === hookName)
            .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    }
    /**
     * 检查是否有指定名称的钩子
     */
    hasHooks(hookName) {
        return this.hooks.some((h) => h.hookName === hookName);
    }
    /**
     * 获取指定名称的钩子数量
     */
    getHookCount(hookName) {
        return this.hooks.filter((h) => h.hookName === hookName).length;
    }
    /**
     * 清空所有钩子
     */
    clear() {
        this.hooks.length = 0;
    }
    /**
     * 获取所有已注册的钩子（用于调试）
     */
    getAllHooks() {
        return this.hooks;
    }
}
//# sourceMappingURL=hooks.js.map