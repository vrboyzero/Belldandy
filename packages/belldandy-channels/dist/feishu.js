"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeishuChannel = void 0;
var lark = require("@larksuiteoapi/node-sdk");
/**
 * 飞书渠道实现
 * 使用 WebSocket 长连接模式，无需公网 IP
 */
var FeishuChannel = /** @class */ (function () {
    function FeishuChannel(config) {
        /** 渠道名称 */
        this.name = "feishu";
        this._running = false;
        // Deduplication: track processed message IDs to avoid responding multiple times
        this.processedMessages = new Set();
        this.MESSAGE_CACHE_SIZE = 1000;
        this.agent = config.agent;
        // HTTP Client for sending messages
        this.client = new lark.Client({
            appId: config.appId,
            appSecret: config.appSecret,
        });
        // WebSocket Client for receiving events
        this.wsClient = new lark.WSClient({
            appId: config.appId,
            appSecret: config.appSecret,
            loggerLevel: lark.LoggerLevel.info,
        });
        // Store callback
        this.onChatIdUpdate = config.onChatIdUpdate;
        // setupEventHandlers was removed
        if (config.initialChatId) {
            this.lastChatId = config.initialChatId;
            console.log("Feishu: Restored last chat ID: ".concat(this.lastChatId));
        }
    }
    Object.defineProperty(FeishuChannel.prototype, "isRunning", {
        /** 渠道是否正在运行 */
        get: function () {
            return this._running;
        },
        enumerable: false,
        configurable: true
    });
    FeishuChannel.prototype.start = function () {
        return __awaiter(this, void 0, void 0, function () {
            var eventDispatcher;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this._running)
                            return [2 /*return*/];
                        eventDispatcher = new lark.EventDispatcher({}).register({
                            "im.message.receive_v1": function (data) { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, this.handleMessage(data)];
                                        case 1:
                                            _a.sent();
                                            return [2 /*return*/];
                                    }
                                });
                            }); },
                        });
                        // Start WS connection with the dispatcher
                        return [4 /*yield*/, this.wsClient.start({
                                eventDispatcher: eventDispatcher,
                            })];
                    case 1:
                        // Start WS connection with the dispatcher
                        _a.sent();
                        this._running = true;
                        console.log("[".concat(this.name, "] WebSocket Channel started."));
                        return [2 /*return*/];
                }
            });
        });
    };
    FeishuChannel.prototype.stop = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (!this._running)
                    return [2 /*return*/];
                try {
                    // Note: @larksuiteoapi/node-sdk WSClient 目前没有公开的 stop/close 方法
                    // 如果未来 SDK 支持，可以在这里调用
                    // await this.wsClient.stop();
                    this._running = false;
                    this.processedMessages.clear();
                    console.log("[".concat(this.name, "] Channel stopped."));
                }
                catch (e) {
                    console.error("[".concat(this.name, "] Error stopping channel:"), e);
                    throw e;
                }
                return [2 /*return*/];
            });
        });
    };
    FeishuChannel.prototype.handleMessage = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var message, sender, chatId, msgId, firstKey, text, contentObj, runInput, stream, replyText, _a, stream_1, stream_1_1, item, e_1_1, e_2;
            var _b, e_1, _c, _d;
            var _e, _f;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        message = data.message;
                        sender = data.sender;
                        if (!message) {
                            console.error("Feishu: message object is undefined in event data", data);
                            return [2 /*return*/];
                        }
                        // Ignore updates, own messages, or system messages if needed
                        // Usually we check message_type
                        if (message.message_type !== "text") {
                            // For now, only handle text
                            // TODO: Support images/files
                            return [2 /*return*/];
                        }
                        chatId = message.chat_id;
                        if (this.lastChatId !== chatId) {
                            this.lastChatId = chatId;
                            // Notify listener for persistence
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            (_e = this.onChatIdUpdate) === null || _e === void 0 ? void 0 : _e.call(this, chatId);
                        }
                        msgId = message.message_id;
                        // === Deduplication: skip if we've already processed this message ===
                        if (this.processedMessages.has(msgId)) {
                            console.log("Feishu: Skipping duplicate message ".concat(msgId));
                            return [2 /*return*/];
                        }
                        // Mark as processed immediately to prevent concurrent processing
                        this.processedMessages.add(msgId);
                        // Limit cache size to prevent memory leak
                        if (this.processedMessages.size > this.MESSAGE_CACHE_SIZE) {
                            firstKey = this.processedMessages.values().next().value;
                            if (firstKey)
                                this.processedMessages.delete(firstKey);
                        }
                        text = "";
                        try {
                            contentObj = JSON.parse(message.content);
                            text = contentObj.text;
                        }
                        catch (e) {
                            console.error("Failed to parse Feishu message content", e);
                            return [2 /*return*/];
                        }
                        // Ignore empty messages
                        if (!text)
                            return [2 /*return*/];
                        console.log("Feishu: Processing message ".concat(msgId, " from chat ").concat(chatId, ": \"").concat(text.slice(0, 50), "...\""));
                        runInput = {
                            conversationId: chatId, // Map Feishu Chat ID to Conversation ID
                            text: text,
                            // We could pass sender info in meta
                            meta: {
                                from: sender,
                                messageId: msgId,
                                channel: "feishu"
                            }
                        };
                        _g.label = 1;
                    case 1:
                        _g.trys.push([1, 17, , 19]);
                        stream = this.agent.run(runInput);
                        replyText = "";
                        _g.label = 2;
                    case 2:
                        _g.trys.push([2, 7, 8, 13]);
                        _a = true, stream_1 = __asyncValues(stream);
                        _g.label = 3;
                    case 3: return [4 /*yield*/, stream_1.next()];
                    case 4:
                        if (!(stream_1_1 = _g.sent(), _b = stream_1_1.done, !_b)) return [3 /*break*/, 6];
                        _d = stream_1_1.value;
                        _a = false;
                        item = _d;
                        if (item.type === "delta") {
                            // Streaming is tricky with Feishu unless we use "card" updates.
                            // For simplicity in MVP, we accumulate and send send/reply at the end.
                            replyText += item.delta;
                        }
                        else if (item.type === "final") {
                            replyText = item.text; // Ensure we get the final full text if provided
                        }
                        else if (item.type === "tool_call") {
                            console.log("Feishu: Tool call: ".concat(item.name), item.arguments);
                        }
                        else if (item.type === "tool_result") {
                            console.log("Feishu: Tool result: ".concat(item.name, " - success: ").concat(item.success), item.success ? (_f = item.output) === null || _f === void 0 ? void 0 : _f.slice(0, 100) : item.error);
                        }
                        _g.label = 5;
                    case 5:
                        _a = true;
                        return [3 /*break*/, 3];
                    case 6: return [3 /*break*/, 13];
                    case 7:
                        e_1_1 = _g.sent();
                        e_1 = { error: e_1_1 };
                        return [3 /*break*/, 13];
                    case 8:
                        _g.trys.push([8, , 11, 12]);
                        if (!(!_a && !_b && (_c = stream_1.return))) return [3 /*break*/, 10];
                        return [4 /*yield*/, _c.call(stream_1)];
                    case 9:
                        _g.sent();
                        _g.label = 10;
                    case 10: return [3 /*break*/, 12];
                    case 11:
                        if (e_1) throw e_1.error;
                        return [7 /*endfinally*/];
                    case 12: return [7 /*endfinally*/];
                    case 13:
                        if (!replyText) return [3 /*break*/, 15];
                        return [4 /*yield*/, this.reply(msgId, replyText)];
                    case 14:
                        _g.sent();
                        console.log("Feishu: Repled to message ".concat(msgId));
                        return [3 /*break*/, 16];
                    case 15:
                        console.warn("Feishu: Agent returned empty response for message ".concat(msgId));
                        _g.label = 16;
                    case 16: return [3 /*break*/, 19];
                    case 17:
                        e_2 = _g.sent();
                        console.error("Error running agent for Feishu message:", e_2);
                        return [4 /*yield*/, this.reply(msgId, "Error: " + String(e_2))];
                    case 18:
                        _g.sent();
                        return [3 /*break*/, 19];
                    case 19: return [2 /*return*/];
                }
            });
        });
    };
    FeishuChannel.prototype.reply = function (messageId, content) {
        return __awaiter(this, void 0, void 0, function () {
            var e_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.client.im.message.reply({
                                path: {
                                    message_id: messageId,
                                },
                                data: {
                                    content: JSON.stringify({ text: content }),
                                    msg_type: "text",
                                },
                            })];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        e_3 = _a.sent();
                        console.error("Failed to reply to Feishu:", e_3);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 主动发送消息（非回复）
     * @param content - 消息内容
     * @param chatId - 可选，指定发送目标。不指定则发送到最后活跃的会话
     * @returns 是否发送成功
     */
    FeishuChannel.prototype.sendProactiveMessage = function (content, chatId) {
        return __awaiter(this, void 0, void 0, function () {
            var targetChatId, e_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        targetChatId = chatId || this.lastChatId;
                        if (!targetChatId) {
                            console.warn("[".concat(this.name, "] Cannot send proactive message - no active chat ID found."));
                            return [2 /*return*/, false];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.client.im.message.create({
                                params: {
                                    receive_id_type: "chat_id",
                                },
                                data: {
                                    receive_id: targetChatId,
                                    content: JSON.stringify({ text: content }),
                                    msg_type: "text",
                                },
                            })];
                    case 2:
                        _a.sent();
                        console.log("[".concat(this.name, "] Proactive message sent to ").concat(targetChatId));
                        return [2 /*return*/, true];
                    case 3:
                        e_4 = _a.sent();
                        console.error("[".concat(this.name, "] Failed to send proactive message:"), e_4);
                        return [2 /*return*/, false];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return FeishuChannel;
}());
exports.FeishuChannel = FeishuChannel;
