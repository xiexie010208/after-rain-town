package cn.edu.ustc.afterrain.game;

import cn.edu.ustc.afterrain.ai.AiDialogueService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.concurrent.CompletableFuture;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GameService {
    private final GameSessionRepository repository;
    private final ObjectMapper objectMapper;
    private final AiDialogueService aiDialogueService;

    public GameService(GameSessionRepository repository, ObjectMapper objectMapper, AiDialogueService aiDialogueService) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.aiDialogueService = aiDialogueService;
    }

    @Transactional
    public GameState start(String playerName) {
        var sessionId = UUID.randomUUID().toString();
        var state = initialState(sessionId, normalizeName(playerName));
        repository.save(new GameSessionEntity(sessionId, write(state)));
        return state;
    }

    @Transactional(readOnly = true)
    public GameState get(String id) {
        return repository.findById(id).map(entity -> read(entity.getStateJson()))
            .orElseThrow(() -> new GameNotFoundException(id));
    }

    @Transactional
    public GameState save(String id, GameState state) {
        var entity = repository.findById(id).orElseThrow(() -> new GameNotFoundException(id));
        var safeState = new GameState(id, state.playerName(), state.timeMinutes(), state.paused(), state.aiMode(),
            state.teaPartyAnnounced(), Math.max(0, Math.min(20, state.conversationsRemaining())),
            state.inventory(), state.npcs(), state.logs(), state.result());
        entity.update(write(safeState));
        return safeState;
    }

    @Transactional
    public GameState reset(String id) {
        var entity = repository.findById(id).orElseThrow(() -> new GameNotFoundException(id));
        var current = read(entity.getStateJson());
        var state = initialState(id, current.playerName());
        entity.update(write(state));
        return state;
    }

    @Transactional
    public ChatResult talk(String id, String npcId, String message, boolean liveRequested) {
        return talkInternal(id, npcId, message, liveRequested, null);
    }

    @Transactional
    public ChatResult talkStreaming(String id, String npcId, String message, boolean liveRequested,
                                    Consumer<String> onDelta) {
        return talkInternal(id, npcId, message, liveRequested, onDelta);
    }

    @Transactional(readOnly = true)
    public AiDialogueService.EventDialogueReply eventDialogue(String id, List<String> participantIds,
                                                               String eventTitle, String action, String attitude,
                                                               String playerLine, boolean liveRequested) {
        var state = get(id);
        var participants = resolveParticipants(state, participantIds);
        var safeTitle = truncate(eventTitle, "小镇事件", 40);
        var safeLine = truncate(playerLine, "", 120);
        return aiDialogueService.eventReplies(state, participants, safeTitle, action, attitude, safeLine, liveRequested);
    }

    @Transactional(readOnly = true)
    public AiDialogueService.EventDialogueReply eventDialogueStreaming(
        String id, List<String> participantIds, String eventTitle, String action, String attitude,
        String playerLine, boolean liveRequested, BiConsumer<String, String> onDelta
    ) {
        var state = get(id);
        var participants = resolveParticipants(state, participantIds);
        var safeTitle = truncate(eventTitle, "小镇事件", 40);
        var safeLine = truncate(playerLine, "", 120);

        var futures = participants.stream().map(npc -> CompletableFuture.supplyAsync(() ->
            aiDialogueService.streamEventReply(state, npc, safeTitle, action, attitude, safeLine,
                liveRequested, delta -> onDelta.accept(npc.id(), delta))
        )).toList();

        CompletableFuture.allOf(futures.toArray(CompletableFuture[]::new)).join();
        var replies = new LinkedHashMap<String, String>();
        var completed = new ArrayList<AiDialogueService.DialogueReply>();
        for (int index = 0; index < participants.size(); index++) {
            var reply = futures.get(index).join();
            completed.add(reply);
            replies.put(participants.get(index).id(), reply.text());
        }
        var liveCount = completed.stream().filter(reply -> reply.source().startsWith("LIVE")).count();
        var source = completed.stream().allMatch(reply -> reply.source().equals("LIVE")) ? "LIVE"
            : liveCount == 0 ? "MOCK" : "LIVE_PARTIAL";
        var model = completed.stream().map(AiDialogueService.DialogueReply::model).distinct().count() == 1
            ? completed.get(0).model() : "mixed";
        return new AiDialogueService.EventDialogueReply(replies, source, model);
    }

    private List<GameState.NpcState> resolveParticipants(GameState state, List<String> participantIds) {
        if (participantIds == null || participantIds.isEmpty() || participantIds.size() > 3
            || participantIds.stream().distinct().count() != participantIds.size()) {
            throw new IllegalArgumentException("事件参与者数量无效");
        }
        return participantIds.stream().map(npcId -> state.npcs().stream()
            .filter(npc -> npc.id().equals(npcId)).findFirst()
            .orElseThrow(() -> new IllegalArgumentException("NPC不存在"))).toList();
    }

    private String truncate(String value, String fallback, int maximumLength) {
        var normalized = value == null ? fallback : value.strip();
        return normalized.substring(0, Math.min(normalized.length(), maximumLength));
    }

    private ChatResult talkInternal(String id, String npcId, String message, boolean liveRequested,
                                    Consumer<String> onDelta) {
        var entity = repository.findById(id).orElseThrow(() -> new GameNotFoundException(id));
        var state = read(entity.getStateJson());
        if (state.conversationsRemaining() <= 0) throw new IllegalArgumentException("本局自由对话次数已用完");
        if (state.timeMinutes() >= 1080) throw new IllegalArgumentException("茶会时间已经到了");
        var cleanMessage = message == null ? "" : message.strip();
        if (cleanMessage.isBlank() || cleanMessage.length() > 200) throw new IllegalArgumentException("对话内容须为1至200字");
        var target = state.npcs().stream().filter(npc -> npc.id().equals(npcId)).findFirst()
            .orElseThrow(() -> new IllegalArgumentException("NPC不存在"));
        var reply = onDelta == null
            ? aiDialogueService.reply(state, target, cleanMessage, liveRequested)
            : aiDialogueService.streamReply(state, target, cleanMessage, liveRequested, onDelta);

        var updatedNpcs = state.npcs().stream().map(npc -> npc.id().equals(npcId)
            ? withConversation(npc, state.playerName(), cleanMessage, state.teaPartyAnnounced())
            : npc).toList();
        var nextTime = Math.min(1080, state.timeMinutes() + 10);
        var logs = new ArrayList<>(state.logs());
        logs.add(new GameState.ActionLog(nextTime, target.name(), reply.text(), reply.source()));
        if (logs.size() > 50) logs = new ArrayList<>(logs.subList(logs.size() - 50, logs.size()));
        var updated = new GameState(id, state.playerName(), nextTime, state.paused(),
            reply.source().startsWith("LIVE") ? "LIVE" : "MOCK", state.teaPartyAnnounced(),
            state.conversationsRemaining() - 1, state.inventory(), updatedNpcs, logs, state.result());
        entity.update(write(updated));
        return new ChatResult(updated, reply.text(), reply.source(), reply.model());
    }

    @Transactional
    public JsonNode saveClientSnapshot(String id, JsonNode snapshot) {
        var entity = repository.findById(id).orElseThrow(() -> new GameNotFoundException(id));
        if (snapshot == null || !snapshot.isObject()) throw new IllegalArgumentException("存档格式无效");
        var json = snapshot.toString();
        if (json.length() > 100_000) throw new IllegalArgumentException("存档内容过大");
        entity.updateClientSnapshot(json);
        return snapshot;
    }

    @Transactional(readOnly = true)
    public JsonNode getClientSnapshot(String id) {
        var entity = repository.findById(id).orElseThrow(() -> new GameNotFoundException(id));
        if (entity.getClientSnapshotJson() == null) return objectMapper.createObjectNode();
        try { return objectMapper.readTree(entity.getClientSnapshotJson()); }
        catch (JsonProcessingException e) { throw new IllegalStateException("无法恢复客户端存档", e); }
    }

    private GameState.NpcState withConversation(GameState.NpcState npc, String playerName, String message, boolean announced) {
        var memories = new ArrayList<>(npc.memories());
        memories.add(playerName + "和我聊到：“" + message.substring(0, Math.min(message.length(), 42)) + "”");
        if (memories.size() > 10) memories = new ArrayList<>(memories.subList(memories.size() - 10, memories.size()));
        var relation = Math.min(100, npc.playerRelation() + 10);
        var threshold = switch (npc.id()) { case "weining" -> 30; default -> 20; };
        return new GameState.NpcState(npc.id(), npc.name(), npc.role(), npc.personality(), npc.energy(),
            Math.min(100, npc.mood() + 3), npc.socialNeed(), relation, npc.location(), npc.action(), npc.goal(),
            npc.attending() || (announced && relation >= threshold), memories);
    }

    private GameState initialState(String sessionId, String playerName) {
        var inventory = new LinkedHashMap<String, Integer>();
        inventory.put("coffee", 1);
        inventory.put("umbrella", 1);
        var npcs = List.of(
            new GameState.NpcState("alan", "阿岚", "活动策划人", "热情、外向、行动力强", 76, 82, 78, 5,
                "plaza", "观察雨后的广场", "筹备让大家放松的茶会", false, new ArrayList<>(List.of("听说今天有一位新居民搬进小镇。"))),
            new GameState.NpcState("weining", "魏宁", "自由插画师", "安静、谨慎、重视独处", 48, 64, 34, 0,
                "cafe", "绘制雨后街景", "完成插画草稿并恢复灵感", false, new ArrayList<>(List.of("苏禾为我保留了靠窗的安静位置。"))),
            new GameState.NpcState("suhe", "苏禾", "咖啡馆店主", "沉稳、务实、责任感强", 69, 74, 55, 0,
                "cafe", "整理咖啡馆", "照看咖啡馆并留意居民需求", false, new ArrayList<>(List.of("魏宁今天看起来有些疲惫。")))
        );
        var logs = List.of(
            new GameState.ActionLog(900, "阿岚", "正在中央广场观察雨后的街道。", "MOCK"),
            new GameState.ActionLog(900, "魏宁", "留在咖啡馆，想先恢复一些灵感。", "MOCK")
        );
        return new GameState(sessionId, playerName, 900, false, "LIVE", false, 20, inventory, npcs, logs, "IN_PROGRESS");
    }

    private String normalizeName(String name) {
        if (name == null || name.isBlank()) return "新居民";
        return name.strip().substring(0, Math.min(name.strip().length(), 20));
    }

    private String write(GameState state) {
        try { return objectMapper.writeValueAsString(state); }
        catch (JsonProcessingException e) { throw new IllegalStateException("无法保存游戏状态", e); }
    }

    private GameState read(String json) {
        try { return objectMapper.readValue(json, GameState.class); }
        catch (JsonProcessingException e) { throw new IllegalStateException("无法恢复游戏状态", e); }
    }

    public record ChatResult(GameState state, String reply, String source, String model) {}
}
