export type TeamChannel = {
  id: string;
  name: string;
  is_private: boolean;
  created_at?: string;
  created_by?: string;
  channel_type?: 'channel' | 'dm';
};

export type TeamMessage = {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user_email?: string;
  channel_type?: 'channel' | 'dm';
};

export type TeamProfile = {
  id?: string;
  user_id: string;
  display_name?: string;
  avatar_url?: string;
  email?: string;
};

