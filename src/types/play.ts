export interface PlayGridLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  static?: boolean;
}

export interface PlayLayout {
  id: string;
  name: string;
  deviceIds: string[];
  items: PlayGridLayoutItem[];
  createdByUserId?: string;
  updatedByUserId?: string;
}


