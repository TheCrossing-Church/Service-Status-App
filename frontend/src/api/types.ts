// Shapes mirror the backend's response envelope and DB rows. Keep these
// in sync if you change the backend schema or response wrappers.

export type CurrentStatus = {
  campus_id: number;
  campus_slug: string;
  campus_name: string;
  campus_code: string | null;
  status_update_id: number | null;
  status_type_id: number | null;
  status_slug: string | null;
  status_label: string | null;
  status_color: string | null;
  status_icon: string | null;
  message: string | null;
  sent_via: "web" | "webhook" | "system" | null;
  created_at: string | null;
};

export type Campus = {
  id: number;
  slug: string;
  name: string;
  code: string | null;
  timezone: string;
};

export type StatusType = {
  id: number;
  campus_id: number;
  slug: string;
  label: string;
  default_message: string | null;
  color: string | null;
  icon: string | null;
  sort_order: number;
  active: boolean | number;
};

export type CurrentUser = {
  id: number;
  username: string;
  email: string | null;
  display_name: string;
  role: "admin" | "sender";
  active: boolean;
  campus_ids: number[];
};

export type LoginResponse = {
  token: string;
  user: CurrentUser;
};

export type StatusUpdate = {
  status_update_id: number;
  campus: { id: number; slug: string; name: string };
  status_type: {
    id: number;
    slug: string;
    label: string;
    color: string | null;
    icon: string | null;
  };
  message: string | null;
  sent_via: "web" | "webhook" | "system";
  created_at: string;
};

export type HistoryEntry = {
  id: number;
  message: string | null;
  sent_via: "web" | "webhook" | "system";
  created_at: string;
  status_slug: string;
  status_label: string;
  status_color: string | null;
  status_icon: string | null;
  sent_by_display_name: string | null;
};

export type SubscriberRow = {
  id: number;
  email: string;
  display_name: string;
  active: number;
  created_at: string;
  device_count: number;
  memberships: {
    campus_slug: string;
    group_slug: string;
    group_name: string;
  }[];
};

export type ApiTokenRow = {
  id: number;
  campus_id: number;
  label: string;
  prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
  campus_slug: string;
  campus_name: string;
};

export type SubscriberGroup = {
  id: number;
  campus_id: number;
  slug: string;
  name: string;
  active: number | boolean;
};
