'use client';

import { useState, useEffect } from 'react';

type Comment = {
  id: string;
  content: string;
  user_id: string;
  user: {
    id: string;
    email: string;
  };
  created_at: string;
  updated_at: string;
  is_edited: boolean;
  parent_comment_id: string | null;
  replies?: Comment[];
};

type Props = {
  recommendationId: string;
  onClose?: () => void;
};

export default function CommentsSection({ recommendationId, onClose }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchComments();
  }, [recommendationId]);

  const fetchComments = async () => {
    try {
      const res = await fetch(`/api/recommendations/${recommendationId}/comments`);
      const data = await res.json();

      if (res.ok) {
        setComments(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/recommendations/${recommendationId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newComment }),
      });

      if (res.ok) {
        setNewComment('');
        await fetchComments();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to add comment');
      }
    } catch (err) {
      alert('Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async (parentId: string) => {
    if (!replyContent.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/recommendations/${recommendationId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: replyContent,
          parent_comment_id: parentId,
        }),
      });

      if (res.ok) {
        setReplyContent('');
        setReplyingTo(null);
        await fetchComments();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to add reply');
      }
    } catch (err) {
      alert('Failed to add reply');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditComment = async (commentId: string) => {
    if (!editContent.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/recommendations/comments/${commentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      });

      if (res.ok) {
        setEditContent('');
        setEditingComment(null);
        await fetchComments();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update comment');
      }
    } catch (err) {
      alert('Failed to update comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('Delete this comment?')) return;

    try {
      const res = await fetch(`/api/recommendations/comments/${commentId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        await fetchComments();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete comment');
      }
    } catch (err) {
      alert('Failed to delete comment');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return minutes <= 1 ? 'just now' : `${minutes}m ago`;
      }
      return `${hours}h ago`;
    } else if (days === 1) {
      return 'yesterday';
    } else if (days < 7) {
      return `${days}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getUserInitials = (email: string) => {
    const name = email.split('@')[0];
    return name.substring(0, 2).toUpperCase();
  };

  const renderComment = (comment: Comment, depth = 0) => {
    const isEditing = editingComment === comment.id;
    const isReplying = replyingTo === comment.id;

    return (
      <div key={comment.id} className={depth > 0 ? 'ml-8 mt-3' : 'mt-4'}>
        <div className="flex gap-3">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-azure via-azure/90 to-azure/70 flex items-center justify-center text-white text-xs font-medium">
              {getUserInitials(comment.user.email)}
            </div>
          </div>

          {/* Comment Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-medium text-neutral-900">
                {comment.user.email.split('@')[0]}
              </span>
              <span className="text-xs text-neutral-500">
                {formatDate(comment.created_at)}
                {comment.is_edited && ' (edited)'}
              </span>
            </div>

            {isEditing ? (
              <div className="mt-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure resize-none"
                  rows={2}
                  autoFocus
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => handleEditComment(comment.id)}
                    disabled={submitting}
                    className="px-3 py-1 text-xs bg-azure text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setEditingComment(null);
                      setEditContent('');
                    }}
                    className="px-3 py-1 text-xs border border-neutral-300 rounded-lg hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-sm text-neutral-700 whitespace-pre-wrap break-words">
                {comment.content}
              </p>
            )}

            {/* Actions */}
            {!isEditing && (
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={() => setReplyingTo(comment.id)}
                  className="text-xs text-azure hover:underline"
                >
                  Reply
                </button>
                <button
                  onClick={() => {
                    setEditingComment(comment.id);
                    setEditContent(comment.content);
                  }}
                  className="text-xs text-neutral-600 hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteComment(comment.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Delete
                </button>
              </div>
            )}

            {/* Reply Form */}
            {isReplying && (
              <div className="mt-3">
                <textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="Write a reply..."
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure resize-none"
                  rows={2}
                  autoFocus
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => handleReply(comment.id)}
                    disabled={submitting}
                    className="px-3 py-1 text-xs bg-azure text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                  >
                    Reply
                  </button>
                  <button
                    onClick={() => {
                      setReplyingTo(null);
                      setReplyContent('');
                    }}
                    className="px-3 py-1 text-xs border border-neutral-300 rounded-lg hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Render Replies */}
            {comment.replies && comment.replies.length > 0 && (
              <div className="mt-2">
                {comment.replies.map(reply => renderComment(reply, depth + 1))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-neutral-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-neutral-900">
          Discussion ({comments.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0)})
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* New Comment Form */}
      <div className="mb-6">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Share your thoughts about this organization..."
          className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure resize-none"
          rows={3}
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={handleAddComment}
            disabled={submitting || !newComment.trim()}
            className="px-4 py-2 bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting ? 'Posting...' : 'Post Comment'}
          </button>
        </div>
      </div>

      {/* Comments List */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="inline-block w-6 h-6 border-4 border-azure/30 border-t-azure rounded-full animate-spin"></div>
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-8">
          <svg className="w-12 h-12 text-neutral-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-neutral-600 text-sm">No comments yet</p>
          <p className="text-neutral-500 text-xs mt-1">Be the first to share your thoughts</p>
        </div>
      ) : (
        <div className="space-y-1">
          {comments.map(comment => renderComment(comment))}
        </div>
      )}
    </div>
  );
}
