export type SlotPosition =
  | 'popup'
  | 'top_slider'
  | 'middle_banner'
  | 'grid_logo'
  | 'bottom_sticky';

export interface SlotAd {
  id: string | number;
  agent_name: string;
  slot_position: SlotPosition;
  media_url: string;
  target_url: string;
  end_date: string;
  display_order: number;
  is_active: boolean;
  clicks_count: number;
  created_at?: string;
}

export interface CreateAdPayload {
  agent_name: string;
  slot_position: SlotPosition;
  media_url: string;
  target_url: string;
  end_date: string;
  display_order: number;
  is_active?: boolean;
}

export interface UpdateAdPayload {
  agent_name?: string;
  slot_position?: SlotPosition;
  media_url?: string;
  target_url?: string;
  end_date?: string;
  display_order?: number;
  is_active?: boolean;
}

export interface SlotOption {
  value: SlotPosition;
  label: string;
  shortLabel: string;
  hint: string;
}

export const SLOT_OPTIONS: SlotOption[] = [
  {
    value: 'popup',
    label: 'Popup Overlay',
    shortLabel: 'Popup',
    hint: 'Full-screen launch modal',
  },
  {
    value: 'top_slider',
    label: 'Top Slider',
    shortLabel: 'Top Slider',
    hint: 'Hero carousel banner',
  },
  {
    value: 'middle_banner',
    label: 'Middle Banner',
    shortLabel: 'Mid Banner',
    hint: 'In-feed wide strip',
  },
  {
    value: 'grid_logo',
    label: 'Grid Logo',
    shortLabel: 'Grid Logo',
    hint: 'Partner sponsor tile',
  },
  {
    value: 'bottom_sticky',
    label: 'Bottom Sticky',
    shortLabel: 'Bottom Sticky',
    hint: 'Pinned footer banner',
  },
];

export const SLOT_MAP: Record<SlotPosition, SlotOption> = SLOT_OPTIONS.reduce(
  (acc, item) => {
    acc[item.value] = item;
    return acc;
  },
  {} as Record<SlotPosition, SlotOption>,
);
