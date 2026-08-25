package cn.edu.ustc.afterrain.game;

public class GameNotFoundException extends RuntimeException {
    public GameNotFoundException(String id) { super("Game session not found: " + id); }
}
