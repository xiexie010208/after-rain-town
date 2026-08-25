package cn.edu.ustc.afterrain.game;

import java.util.List;
import java.util.Map;

public record GameState(
    String sessionId,
    String playerName,
    int timeMinutes,
    boolean paused,
    String aiMode,
    boolean teaPartyAnnounced,
    int conversationsRemaining,
    Map<String, Integer> inventory,
    List<NpcState> npcs,
    List<ActionLog> logs,
    String result
) {
    public record NpcState(
        String id, String name, String role, String personality,
        int energy, int mood, int socialNeed, int playerRelation,
        String location, String action, String goal, boolean attending,
        List<String> memories
    ) {}

    public record ActionLog(int timeMinutes, String actor, String text, String source) {}
}
