package cn.edu.ustc.afterrain.game;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "game_sessions")
public class GameSessionEntity {
    @Id
    private String id;

    @Lob
    @Column(nullable = false, columnDefinition = "TEXT")
    private String stateJson;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String clientSnapshotJson;

    @Column(nullable = false)
    private Instant updatedAt;

    protected GameSessionEntity() {}

    public GameSessionEntity(String id, String stateJson) {
        this.id = id;
        this.stateJson = stateJson;
        this.updatedAt = Instant.now();
    }

    public String getId() { return id; }
    public String getStateJson() { return stateJson; }
    public String getClientSnapshotJson() { return clientSnapshotJson; }
    public void update(String stateJson) { this.stateJson = stateJson; this.updatedAt = Instant.now(); }
    public void updateClientSnapshot(String json) { this.clientSnapshotJson = json; this.updatedAt = Instant.now(); }
}
