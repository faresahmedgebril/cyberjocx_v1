export type ConversationParticipants = { userOneId: number; userTwoId: number };

export function isConversationParticipant(conversation: ConversationParticipants, userId: number) {
  return conversation.userOneId === userId || conversation.userTwoId === userId;
}
