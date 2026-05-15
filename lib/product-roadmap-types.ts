export type RoadmapItemStatus = 'shipped' | 'in_progress' | 'planned';

export type RoadmapLocalized = { tr: string; en: string };

export type ProductRoadmapItem = {
  status: RoadmapItemStatus;
  title: RoadmapLocalized;
  href: string | null;
};

export type ProductRoadmapPillar = {
  id: string;
  title: RoadmapLocalized;
  items: ProductRoadmapItem[];
};

export type ProductRoadmapPayload = {
  version: number;
  updated: string;
  pillars: ProductRoadmapPillar[];
};
