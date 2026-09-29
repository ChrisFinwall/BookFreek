export interface Book {
  Id: string;
  Name: string;
  Album?: string;
  AlbumArtist?: string;
  Artists?: string[];
  ProductionYear?: number;
  Overview?: string;
  RunTimeTicks?: number;
  ImageTags?: { Primary?: string };
  UserData?: { PlaybackPositionTicks?: number; Played?: boolean };
  Path?: string;
  Chapters?: JellyfinChapter[];
}

export interface JellyfinChapter {
  Name?: string;
  StartPositionTicks: number;
  ImageTag?: string;
}

export interface Chapter {
  title: string;
  start: number;
  end?: number;
}

export interface BookMetadata {
  title: string;
  authors: string[];
  description?: string;
  firstPublished?: number;
  coverUrl?: string;
  sourceUrl?: string;
  subjects: string[];
  source: string;
}

export interface Session {
  userId: string;
  username: string;
  serverUrl: string;
}

export interface ApiError {
  error: string;
}
