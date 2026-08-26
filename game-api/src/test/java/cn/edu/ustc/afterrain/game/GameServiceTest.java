package cn.edu.ustc.afterrain.game;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import com.fasterxml.jackson.databind.ObjectMapper;

@SpringBootTest
class GameServiceTest {
    @Autowired GameService service;
    @Autowired ObjectMapper objectMapper;

    @Test
    void savesAndRestoresInitialWorld() {
        var started = service.start("小雨");
        var restored = service.get(started.sessionId());

        assertThat(restored.playerName()).isEqualTo("小雨");
        assertThat(restored.npcs()).hasSize(3);
        assertThat(restored.inventory()).containsEntry("coffee", 1).containsEntry("umbrella", 1);
        assertThat(restored.conversationsRemaining()).isEqualTo(20);
    }

    @Test
    void dialogueFallsBackAndKeepsOnlyTenMemories() {
        var started = service.start("小雨");
        GameService.ChatResult result = null;
        for (int i = 0; i < 11; i++) {
            result = service.talk(started.sessionId(), "alan", "第" + i + "次聊茶会", true);
        }

        assertThat(result).isNotNull();
        assertThat(result.source()).isEqualTo("MOCK");
        assertThat(result.state().conversationsRemaining()).isEqualTo(9);
        assertThat(result.state().npcs().get(0).memories()).hasSize(10);
    }

    @Test
    void savesAndRestoresClientSnapshot() {
        var started = service.start("小雨");
        var snapshot = objectMapper.createObjectNode().put("minute", 970).put("announced", true);
        service.saveClientSnapshot(started.sessionId(), snapshot);

        assertThat(service.getClientSnapshot(started.sessionId()).path("minute").asInt()).isEqualTo(970);
        assertThat(service.getClientSnapshot(started.sessionId()).path("announced").asBoolean()).isTrue();
    }

    @Test
    void streamsDialogueAndPersistsTheCompletedTurn() {
        var started = service.start("小雨");
        var streamed = new StringBuilder();

        var result = service.talkStreaming(started.sessionId(), "alan", "茶会准备得怎么样？", true,
            streamed::append);

        assertThat(streamed.toString()).isEqualTo(result.reply());
        assertThat(result.state().conversationsRemaining()).isEqualTo(19);
        assertThat(service.get(started.sessionId()).logs()).hasSize(3);
    }

    @Test
    void eventDialogueFallsBackWithoutConsumingFreeDialogue() {
        var started = service.start("小雨");
        var result = service.eventDialogue(started.sessionId(), java.util.List.of("weining", "suhe"),
            "创意分歧", "进行调解", "温和", "先听听彼此的想法。", true);

        assertThat(result.source()).isEqualTo("MOCK");
        assertThat(result.replies()).containsKeys("weining", "suhe");
        assertThat(service.get(started.sessionId()).conversationsRemaining()).isEqualTo(20);
    }

    @Test
    void streamsEachEventParticipantWithoutConsumingFreeDialogue() {
        var started = service.start("小雨");
        var streamed = new java.util.concurrent.ConcurrentHashMap<String, StringBuilder>();

        var result = service.eventDialogueStreaming(started.sessionId(), java.util.List.of("weining", "suhe"),
            "创意分歧", "进行调解", "温和", "先听听彼此的想法。", true,
            (npcId, delta) -> streamed.computeIfAbsent(npcId, ignored -> new StringBuilder()).append(delta));

        assertThat(streamed).containsKeys("weining", "suhe");
        assertThat(streamed.get("weining").toString()).isEqualTo(result.replies().get("weining"));
        assertThat(streamed.get("suhe").toString()).isEqualTo(result.replies().get("suhe"));
        assertThat(result.source()).isEqualTo("MOCK");
        assertThat(service.get(started.sessionId()).conversationsRemaining()).isEqualTo(20);
    }
}
