export type SocialReaction = "like" | "love" | "angry" | "laugh" | "dislike";

export function nextReaction(current: SocialReaction | null | undefined, requested: SocialReaction) {
  return current === requested ? null : requested;
}

export function nextShareState(alreadyShared: boolean) {
  return !alreadyShared;
}
