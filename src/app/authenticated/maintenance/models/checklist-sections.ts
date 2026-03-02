export type ChecklistSection = {
  key: string;
  title: string;
  hint?: string;
  items: ChecklistTemplateItem[];
};

export type ChecklistTemplateItem = {
  text: string;
  requiresPhoto: boolean;
};

export type ChecklistItem = {
  id: string;
  text: string;
  requiresPhoto: boolean;
  url?: string | null;
  isEditable: boolean;
  checked?: boolean;
};

export type SavedChecklistItem = {
  text: string;
  requiresPhoto: boolean;
  url?: string | null;
  checked: boolean;
  isEditable: boolean;
};

export type SavedChecklistSection = {
  key: string;
  title?: string;
  notes?: string;
  sets: SavedChecklistItem[][];
};

export type SavedAnswerSection = {
  key: string;
  notes?: string;
  sets: boolean[][];
};

export const INVENTORY_SECTIONS: ChecklistSection[] = [
  {
    key: 'frontEntrance',
    title: 'Front Entrance',
    items: [
      { text: 'Side Table.', requiresPhoto: false },
    ]
  },
  {
    key: 'diningRoom',
    title: 'Dining Room',
    items: [
      { text: 'Dining Table.', requiresPhoto: false },
      { text: '4 Chairs.', requiresPhoto: false },
      { text: '2 Place settings.', requiresPhoto: false },
      { text: 'Photo: Full view.', requiresPhoto: false }
   ]
  },
  {
    key: 'livingRoom',
    title: 'Living Room',
    items: [
      { text: 'Couch.', requiresPhoto: false },
      { text: '2 Endtables.', requiresPhoto: false },
      { text: 'Coffee Table', requiresPhoto: false },
      { text: 'Lounge Chair.', requiresPhoto: false }
    ]
  },
  {
    key: 'kitchen',
    title: 'Kitchen',
    hint: 'Please take photos of the outside/inside of all appliances.',
    items: [
      { text: '8 large plates', requiresPhoto: false },
      { text: '8 small plate', requiresPhoto: false },
      { text: '8 glasses.', requiresPhoto: false },
      { text: '8 mugs.', requiresPhoto: false },
      { text: '8 spoons.', requiresPhoto: false },
      { text: '8 knives.', requiresPhoto: false },
      { text: '8 forks', requiresPhoto: false }
    ]
  },
  {
    key: 'bedrooms',
    title: 'Bedrooms',
    items: [
      { text: 'Bed', requiresPhoto: false },
      { text: '2 End Tables', requiresPhoto: false },
      { text: '1 Dresser', requiresPhoto: false },
    ]
  },
  {
    key: 'bathrooms',
    title: 'Bathrooms',
    items: [
      { text: 'Soap Dish', requiresPhoto: false },
      { text: '2 Towels', requiresPhoto: false },
    ]
  },
  {
    key: 'utilityRoom',
    title: 'Utility Room',
    items: [
      { text: '1 Iron and Ironing Board', requiresPhoto: false },
      { text: '1 Vacuum', requiresPhoto: false },
      { text: '1 Broom and dustpan', requiresPhoto: false },
    ]
  },
];

export const INSPECTION_SECTIONS: ChecklistSection[] = [
  {
    key: 'frontEntrance',
    title: 'Front Entrance',
    items: [
      { text: 'Entrance is free of debris and cobwebs.', requiresPhoto: false },
      { text: 'Front and sliding glass doors clean. Doorknob/handle secured.', requiresPhoto: false },
      { text: 'Door(s) close securely and are locked.', requiresPhoto: false },
      { text: 'Outside light working.', requiresPhoto: false },
      { text: 'Entry mat clean and in good condition.', requiresPhoto: false },
      { text: 'Photo: Full view.', requiresPhoto: true }
    ]
  },
  {
    key: 'diningRoom',
    title: 'Dining Room',
    items: [
      { text: 'Dining room table and chairs sturdy, clean and in good condition.', requiresPhoto: false },
      { text: '2-place settings set out on the table.', requiresPhoto: false },
      { text: 'Flooring/carpet clean and in good condition.', requiresPhoto: false },
      { text: 'Photo: Full view.', requiresPhoto: true }
   ]
  },
  {
    key: 'livingRoom',
    title: 'Living Room',
    items: [
      { text: 'Furniture setup, clean and dusted.', requiresPhoto: false },
      { text: 'Lamps and overhead lights/fan working and clean.', requiresPhoto: false },
      { text: 'Television and remotes working.', requiresPhoto: true },
      { text: 'Carpet/flooring clean and in good condition.', requiresPhoto: true }
    ]
  },
  {
    key: 'kitchen',
    title: 'Kitchen',
    hint: 'Please take photos of the outside/inside of all appliances.',
    items: [
      { text: 'Kitchen floors and countertops clean.', requiresPhoto: false },
      { text: 'Housewares are clean and in place.', requiresPhoto: false },
      { text: 'Refrigerator/freezer working and clean.', requiresPhoto: false },
      { text: 'Microwave, stove, hood, and burners clean and working.', requiresPhoto: true },
      { text: 'Oven clean and working.', requiresPhoto: true },
      { text: 'Dishwasher and disposal working, no leaks.', requiresPhoto: false },
      { text: 'Kitchen faucet works with hot/cold water.', requiresPhoto: false },
      { text: 'Starter kit provided.', requiresPhoto: true }
    ]
  },
  {
    key: 'bedrooms',
    title: 'Bedrooms',
    items: [
      { text: 'Mattress checked (no stains/bedbugs).', requiresPhoto: true },
      { text: 'Beds neatly made; bedding and pillows in good condition.', requiresPhoto: false },
      { text: 'Bedroom furniture in good condition.', requiresPhoto: false },
      { text: 'Television and remotes working.', requiresPhoto: true },
      { text: 'Lights/fans and remotes working.', requiresPhoto: false },
      { text: 'Closet and drawers clean and organized.', requiresPhoto: false }
    ]
  },
  {
    key: 'bathrooms',
    title: 'Bathrooms',
    items: [
      { text: 'Tub/shower clean, draining, and no mold.', requiresPhoto: true },
      { text: 'Sink hot/cold tested and no leaks.', requiresPhoto: true },
      { text: 'Toilet clean, flushes properly, and no leaks.', requiresPhoto: true },
      { text: 'Towels/liner/rug clean and in good condition.', requiresPhoto: false },
      { text: 'Starter kit provided.', requiresPhoto: false }
    ]
  },
  {
    key: 'utilityRoom',
    title: 'Utility Room',
    items: [
      { text: 'Iron and ironing board in good condition.', requiresPhoto: false },
      { text: 'Vacuum empty, clean, and working.', requiresPhoto: false },
      { text: 'Broom, dustpan, and mop in good condition.', requiresPhoto: false },
      { text: 'Washer and dryer working with no leaks/odor.', requiresPhoto: true }
    ]
  },
  {
    key: 'garage',
    title: 'Garage',
    items: [
      { text: 'Clean and swept of all debris.', requiresPhoto: false },
      { text: 'Trash cans inside and emptied.', requiresPhoto: false },
      { text: 'Garage door openers accounted for and ready for tenants.', requiresPhoto: false }
    ]
  },
  {
    key: 'mustHavePhotosVideos',
    title: 'Must Have Photos / Videos',
    items: [
      { text: 'Unit access key/code working (video).', requiresPhoto: true },
      { text: 'WiFi connection and speed screenshots.', requiresPhoto: true },
      { text: 'Mailbox key and number photo.', requiresPhoto: true },
      { text: 'Welcome basket photo.', requiresPhoto: true },
      { text: 'Parking/garage access and remote proof.', requiresPhoto: true },
      { text: 'Lockbox Location.', requiresPhoto: true },
      { text: 'Lockbox open with key inside.', requiresPhoto: true }
    ]
  }
];
