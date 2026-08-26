package cn.edu.ustc.afterrain.game;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
@RequestMapping("/api/games")
public class GameController {
    private final GameService service;
    private final ObjectMapper objectMapper;

    public GameController(GameService service, ObjectMapper objectMapper) {
        this.service = service;
        this.objectMapper = objectMapper;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public GameState start(@Valid @RequestBody(required = false) StartRequest request) {
        return service.start(request == null ? null : request.playerName());
    }

    @GetMapping("/{id}")
    public GameState get(@PathVariable String id) { return service.get(id); }

    @PutMapping("/{id}")
    public GameState save(@PathVariable String id, @RequestBody GameState state) { return service.save(id, state); }

    @PostMapping("/{id}/reset")
    public GameState reset(@PathVariable String id) { return service.reset(id); }

    @PostMapping("/{id}/dialogue")
    public GameService.ChatResult dialogue(@PathVariable String id, @Valid @RequestBody DialogueRequest request) {
        return service.talk(id, request.npcId(), request.message(), Boolean.TRUE.equals(request.live()));
    }

    @PostMapping(value = "/{id}/dialogue/stream", produces = MediaType.APPLICATION_NDJSON_VALUE)
    public StreamingResponseBody dialogueStream(@PathVariable String id,
                                                 @Valid @RequestBody DialogueRequest request) {
        return output -> {
            try {
                var result = service.talkStreaming(id, request.npcId(), request.message(),
                    Boolean.TRUE.equals(request.live()),
                    delta -> writeStreamEvent(output, new StreamEvent("delta", delta, null)));
                writeStreamEvent(output, new StreamEvent("done", null, result));
            } catch (UncheckedIOException failure) {
                throw failure.getCause();
            }
        };
    }

    @PostMapping(value = "/{id}/events/dialogue/stream", produces = MediaType.APPLICATION_NDJSON_VALUE)
    public StreamingResponseBody eventDialogueStream(@PathVariable String id,
                                                      @Valid @RequestBody EventDialogueRequest request) {
        return output -> {
            var outputLock = new Object();
            try {
                var result = service.eventDialogueStreaming(id, request.participantIds(), request.eventTitle(),
                    request.action(), request.attitude(), request.playerLine(), Boolean.TRUE.equals(request.live()),
                    (npcId, delta) -> {
                        synchronized (outputLock) {
                            writeEventStreamEvent(output, new EventStreamEvent("delta", npcId, delta, null));
                        }
                    });
                synchronized (outputLock) {
                    writeEventStreamEvent(output, new EventStreamEvent("done", null, null, result));
                }
            } catch (UncheckedIOException failure) {
                throw failure.getCause();
            }
        };
    }

    private void writeStreamEvent(OutputStream output, StreamEvent event) {
        try {
            output.write(objectMapper.writeValueAsBytes(event));
            output.write('\n');
            output.flush();
        } catch (IOException failure) {
            throw new UncheckedIOException(failure);
        }
    }

    private void writeEventStreamEvent(OutputStream output, EventStreamEvent event) {
        try {
            output.write(objectMapper.writeValueAsBytes(event));
            output.write('\n');
            output.flush();
        } catch (IOException failure) {
            throw new UncheckedIOException(failure);
        }
    }

    @PutMapping("/{id}/snapshot")
    public JsonNode saveSnapshot(@PathVariable String id, @RequestBody JsonNode snapshot) {
        return service.saveClientSnapshot(id, snapshot);
    }

    @GetMapping("/{id}/snapshot")
    public JsonNode getSnapshot(@PathVariable String id) { return service.getClientSnapshot(id); }

    @ExceptionHandler(GameNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ErrorResponse notFound(GameNotFoundException ex) { return new ErrorResponse(ex.getMessage()); }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorResponse badRequest(IllegalArgumentException ex) { return new ErrorResponse(ex.getMessage()); }

    public record StartRequest(@Size(max = 20) String playerName) {}
    public record DialogueRequest(@NotBlank String npcId, @NotBlank @Size(max = 200) String message, Boolean live) {}
    public record StreamEvent(String type, String text, GameService.ChatResult result) {}
    public record EventDialogueRequest(
        @NotBlank String eventId,
        @NotBlank @Size(max = 40) String eventTitle,
        List<@NotBlank String> participantIds,
        @NotBlank @Size(max = 20) String action,
        @NotBlank @Size(max = 20) String attitude,
        @NotBlank @Size(max = 120) String playerLine,
        Boolean live
    ) {}
    public record EventStreamEvent(String type, String npcId, String text,
        cn.edu.ustc.afterrain.ai.AiDialogueService.EventDialogueReply result) {}
    public record ErrorResponse(String message) {}
}
