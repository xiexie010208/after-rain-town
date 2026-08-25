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
}
