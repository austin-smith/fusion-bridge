'use client';

import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { MarkdownRenderer } from '@/components/ui/chat/markdown-renderer';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { LinearComment, LinearReaction } from '@/services/drivers/linear';
import { formatDistanceToNow } from 'date-fns';

interface LinearCommentsSectionProps {
  comments: LinearComment[];
}

interface CommentWithReplies {
  comment: LinearComment;
  replies: LinearComment[];
}

export function LinearCommentsSection({ comments }: LinearCommentsSectionProps) {
  if (comments.length === 0) {
    return (
      <div className="mt-8 pt-6 border-t">
        <div className="text-center py-8">
          <div className="text-muted-foreground text-sm">
            No comments yet
          </div>
        </div>
      </div>
    );
  }

  // Build threaded structure: top-level comments with their replies
  const topLevelComments = comments
    .filter(comment => !comment.parentId)
    .sort((a, b) => {
      const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
      const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
      return dateA.getTime() - dateB.getTime(); // oldest first
    });

  const threaded: CommentWithReplies[] = topLevelComments.map(comment => ({
    comment,
    replies: comments
      .filter(reply => reply.parentId === comment.id)
      .sort((a, b) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return dateA.getTime() - dateB.getTime(); // oldest first
      })
  }));

  // Group reactions by emoji and count them
  const groupReactions = (reactions: LinearReaction[]) => {
    const grouped = reactions.reduce((acc, reaction) => {
      if (!acc[reaction.emoji]) {
        acc[reaction.emoji] = {
          emoji: reaction.emoji,
          count: 0,
          users: [],
        };
      }
      acc[reaction.emoji].count++;
      acc[reaction.emoji].users.push(reaction.user.name || reaction.user.displayName);
      return acc;
    }, {} as Record<string, { emoji: string; count: number; users: string[] }>);
    
    return Object.values(grouped);
  };

  const renderReactions = (reactions: LinearReaction[]) => {
    if (reactions.length === 0) return null;

    const groupedReactions = groupReactions(reactions);

    return (
      <div className="flex flex-wrap gap-1 mt-2">
        {groupedReactions.map((reactionGroup) => (
          <Tooltip key={reactionGroup.emoji} delayDuration={500}>
            <TooltipTrigger asChild>
              <button 
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full border border-border hover:bg-muted/50 transition-colors"
                onFocus={(e) => e.preventDefault()}
                tabIndex={-1}
                type="button"
              >
                <span className="text-sm">{reactionGroup.emoji}</span>
                <span className="text-xs font-medium text-muted-foreground">
                  {reactionGroup.count}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">
                {reactionGroup.users.slice(0, 3).join(', ')}
                {reactionGroup.users.length > 3 && ` and ${reactionGroup.users.length - 3} more`}
                {` reacted with ${reactionGroup.emoji}`}
              </p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    );
  };

  const renderComment = (comment: LinearComment, isReply = false) => (
    <div key={comment.id} className={`flex gap-3 ${isReply ? 'ml-11' : ''}`}>
      <Avatar className={`${isReply ? 'h-7 w-7' : 'h-8 w-8'} flex-shrink-0`}>
        {comment.user.avatarUrl && (
          <AvatarImage src={comment.user.avatarUrl} alt={comment.user.name} />
        )}
        <AvatarFallback className="text-xs font-medium">
          {(comment.user.name || comment.user.displayName).charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className={`font-medium ${isReply ? 'text-xs' : 'text-sm'}`}>
            {comment.user.name || comment.user.displayName}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(
              comment.createdAt instanceof Date ? comment.createdAt : new Date(comment.createdAt),
              { addSuffix: true }
            )}
          </span>
        </div>
        
        <div className={`prose max-w-none ${isReply ? 'prose-xs' : 'prose-sm'}`}>
          <MarkdownRenderer>{comment.body}</MarkdownRenderer>
        </div>

        {renderReactions(comment.reactions)}
      </div>
    </div>
  );

  return (
    <div className="mt-8 pt-6 border-t">
      <div className="mb-6">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          Comments
          <Badge 
            variant="secondary"
            className="rounded-full"
          >
            {comments.length}
          </Badge>
        </h3>
      </div>
      
      <div className="space-y-6">
        {threaded.map(({ comment, replies }) => (
          <div key={comment.id} className="p-4 border border-border rounded-lg bg-card/50">
            {/* Top-level comment */}
            {renderComment(comment)}
            
            {/* Replies */}
            {replies.length > 0 && (
              <div className="mt-4 pt-4 border-l-2 border-muted-foreground/20 space-y-4">
                {replies.map((reply) => renderComment(reply, true))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}