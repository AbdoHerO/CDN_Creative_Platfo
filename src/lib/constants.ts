import type {
  CampaignStatus,
  Channel,
  CreativeCategory,
  CreativeStatus,
  MediaType,
  RoleKey,
  VersionType,
} from "@/generated/prisma/enums";

/** Client-safe labels and display metadata for database enums. */

export const STATUS_LABELS: Record<CreativeStatus, string> = {
  DRAFT: "Draft",
  PENDING: "Pending",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  DECLINED: "Declined",
  ARCHIVED: "Archived",
};

export const STATUS_ORDER: CreativeStatus[] = ["DRAFT", "PENDING", "IN_REVIEW", "APPROVED", "DECLINED", "ARCHIVED"];

export const CATEGORY_LABELS: Record<CreativeCategory, string> = {
  MARKETING_VIDEO: "Marketing video",
  ADVERTISING_VIDEO: "Advertising video",
  SOCIAL_MEDIA_POST: "Social media post",
  BANNER: "Banner",
  PROMOTIONAL_IMAGE: "Promotional image",
  CAMPAIGN_VISUAL: "Campaign visual",
  DOCUMENT: "Document (PDF)",
  OTHER: "Other",
};

export const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as CreativeCategory[];

export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  VIDEO: "Video",
  IMAGE: "Image",
  DOCUMENT: "Document",
  AUDIO: "Audio",
  OTHER: "Other",
};

export const VERSION_TYPE_LABELS: Record<VersionType, string> = {
  FULL: "Full",
  PREVIEW: "Preview",
  VARIANT: "Variant",
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  LINKEDIN: "LinkedIn",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  X: "X (Twitter)",
  WHATSAPP: "WhatsApp",
  WEBSITE: "Website",
  EMAIL: "Email",
  DISPLAY_ADS: "Display ads",
  IN_APP: "In-app",
  PRINT: "Print",
  OTHER: "Other",
};

export const CHANNEL_ORDER = Object.keys(CHANNEL_LABELS) as Channel[];

export const ROLE_LABELS: Record<RoleKey, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  CREATOR: "Creator",
  VIEWER: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  ADMIN: "Full access: users, applications, settings, deletion and validation.",
  MANAGER: "Manages creatives and campaigns, reviews and approves, views reports.",
  CREATOR: "Uploads creatives, edits own drafts and submits them for validation.",
  VIEWER: "Browses, previews and downloads approved creatives only.",
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

export const LIBRARY_SORTS = {
  newest: "Newest first",
  oldest: "Oldest first",
  name: "Alphabetical",
  updated: "Recently updated",
  largest: "Largest files",
  smallest: "Smallest files",
} as const;

export type LibrarySort = keyof typeof LIBRARY_SORTS;

export const PAGE_SIZES = [24, 48, 96] as const;
