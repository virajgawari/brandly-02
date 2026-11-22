/** A scraped post cut down to the fields the analysis needs (no raw actor JSON). */
export interface SocialPost {
  externalId: string;
  timestamp: string;
  type: "image" | "carousel" | "video" | "text";
  caption: string;
  hashtags: string[];
  mentions: string[];
  likes: number;
  comments: number;
  views: number;
  mediaUrls: string[];
  isSponsored?: boolean;
  isRepost?: boolean;
}

export interface ScoredPost extends SocialPost {
  engagementScore: number;
  isTop: boolean;
}
