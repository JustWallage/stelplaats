import { commentListSchema, commentSchema, okSchema } from "@shared/api";
import { displayName } from "@shared/users";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTaskEvents } from "@/context/WebSocketContext";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { apiFetch, delInit, jsonInit } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

export function CommentSection({ taskId }: { taskId: string }) {
  const base = `/api/tasks/${taskId}/comments`;
  const comments = useCachedFetch(base, commentListSchema);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  useTaskEvents(comments.mutate);

  const handlePost = () => {
    if (body.trim() === "") {
      return;
    }
    setBusy(true);
    void apiFetch(base, commentSchema, {
      ...jsonInit("POST", { body: body.trim() }),
    })
      .then(() => {
        setBody("");
        comments.mutate();
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const handleDelete = (id: number) => {
    void apiFetch(`${base}/${String(id)}`, okSchema, delInit)
      .then(() => {
        comments.mutate();
      })
      .catch(() => {
        comments.mutate();
      });
  };

  const list = comments.data?.comments ?? [];

  return (
    <div className="space-y-3">
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((comment) => (
            <li
              key={comment.id}
              className="flex items-start justify-between gap-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <span className="font-medium">
                  {displayName(comment.author)}
                </span>{" "}
                <span className="text-muted-foreground">
                  · {formatDateTime(comment.createdAt)}
                </span>
                <p className="whitespace-pre-wrap">{comment.body}</p>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Delete comment"
                onClick={() => {
                  handleDelete(comment.id);
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handlePost();
        }}
        className="space-y-2"
      >
        <Textarea
          placeholder="Add a comment"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
          }}
        />
        <Button type="submit" disabled={busy || body.trim() === ""}>
          Comment
        </Button>
      </form>
    </div>
  );
}
