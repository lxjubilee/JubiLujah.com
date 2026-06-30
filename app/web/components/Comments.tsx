'use client';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from './AuthProvider';

interface Comment {
  id: string;
  author_user_id: string;
  author_name: string | null;
  body: string;
  created_at: string;
  edited?: boolean;
}

// Comments widget (§10).
export default function Comments({ type, id }: { type: string; id: string }) {
  const { authenticated, hasRole } = useAuth();
  const [items, setItems] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const load = () => api.get<Comment[]>(`/api/comments/${type}/${id}`).then(setItems).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [type, id]);

  const submit = async () => {
    if (!body.trim()) return;
    setErr(null);
    try {
      await api.post(`/api/comments/${type}/${id}`, { body });
      setBody('');
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to post comment');
    }
  };

  const canComment = authenticated && hasRole('content_editor');

  return (
    <div className="jv-comments" id="comments">
      <h3 className="jv-comments-title">Comments <span className="muted">({items.length})</span></h3>
      <ul className="jv-comment-list">
        {items.map((c) => (
          <li key={c.id} className="jv-comment">
            <div className="jv-comment-head">
              <span className="jv-comment-author">{c.author_name || 'Editor'}</span>
              <span className="jv-comment-time muted">{new Date(c.created_at).toLocaleString()}{c.edited ? ' · edited' : ''}</span>
            </div>
            <div className="jv-comment-body">{c.body}</div>
          </li>
        ))}
        {items.length === 0 && <li className="muted">No comments yet.</li>}
      </ul>
      {canComment ? (
        <div className="jv-comment-form">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add an editorial note…" rows={3} />
          <button className="btn" onClick={submit} disabled={!body.trim()}>Post comment</button>
          {err && <div style={{ color: 'var(--accent-peach)', marginTop: 6 }}>{err}</div>}
        </div>
      ) : (
        <div className="muted">Sign in as a content editor to comment.</div>
      )}
    </div>
  );
}
