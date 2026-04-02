export type ChecklistSection = {
  key: string;
  title: string;
  hint?: string;
  selectionMode?: 'allRequired' | 'exactlyOne' | 'atLeastOne';
  items: ChecklistTemplateItem[];
};

export type ChecklistTemplateItem = {
  text: string;
  requiresPhoto: boolean;
  requiresCount?: boolean;
  count?: number | null;
};

export type ChecklistItem = {
  id: string;
  text: string;
  requiresPhoto: boolean;
  requiresCount: boolean;
  count?: number | null;
  /** Server path (PhotoResponse.photoPath); persisted in saved checklist. */
  photoPath?: string | null;
  /** In-memory only: data URL for preview right after upload; not saved. */
  displayDataUrl?: string | null;
  documentId?: string | null;
  isEditable: boolean;
  checked?: boolean;
  issue?: string | null;
  hasIssue?: boolean;
};

export type SavedChecklistItem = {
  text: string;
  requiresPhoto: boolean;
  requiresCount?: boolean;
  count?: number | null;
  photoPath?: string | null;
  documentId?: string | null;
  checked: boolean;
  isEditable: boolean;
  issue?: string | null;
  hasIssue?: boolean;
};

export type SavedChecklistSection = {
  key: string;
  title?: string;
  notes?: string;
  selectionMode?: 'allRequired' | 'exactlyOne' | 'atLeastOne';
  sets: SavedChecklistItem[][];
};

export type SavedAnswerSection = {
  key: string;
  notes?: string;
  sets: boolean[][];
};

export const INSPECTION_SECTIONS: ChecklistSection[] = [
  {
    key: 'frontEntrance',
    title: 'Front Entrance',
    items: [
      // Checklist items
      { text: 'Unit Keys (1,2,3)', requiresPhoto: false, requiresCount: true },
      { text: 'Mail Keys (1,2,3)', requiresPhoto: false, requiresCount: true },
      { text: 'Building Keys (1,2,3)', requiresPhoto: false, requiresCount: true },
      { text: 'Garage Remotes (1,2,3)', requiresPhoto: false, requiresCount: true },
      { text: 'FOB (1,2,3)', requiresPhoto: false, requiresCount: true },
      { text: 'Amenities Access', requiresPhoto: false, requiresCount: false },
      // Inspection items
      { text: 'Entrance is free of debris and cobwebs.', requiresPhoto: false, requiresCount: false },
      { text: 'Front and sliding glass doors clean. Doorknob/handle secured.', requiresPhoto: false, requiresCount: false },
      { text: 'Door(s) close securely and are locked.', requiresPhoto: false, requiresCount: false },
      { text: 'Outside light working.', requiresPhoto: false, requiresCount: false },
      { text: 'Entry mat clean and in good condition.', requiresPhoto: false, requiresCount: false },
      { text: 'Photo: Full view.', requiresPhoto: true, requiresCount: false }
    ]
  },
  {
    key: 'diningRoom',
    title: 'Dining Room',
    items: [
      { text: 'Dining room table and chairs sturdy, clean and in good condition.', requiresPhoto: false, requiresCount: false },
      { text: '2-place settings set out on the table.', requiresPhoto: false, requiresCount: false },
      { text: 'Flooring/carpet clean and in good condition.', requiresPhoto: false, requiresCount: false },
      { text: 'Photo: Full view.', requiresPhoto: true, requiresCount: false }
   ]
  },
  {
    key: 'livingRoom',
    title: 'Living Room',
    items: [
      // Checklist items
      { text: 'Flat Screen TV', requiresPhoto: false, requiresCount: false },
      { text: 'TV Remote', requiresPhoto: false, requiresCount: false },
      { text: 'TV Stand', requiresPhoto: false, requiresCount: false },
      { text: 'Couch', requiresPhoto: false, requiresCount: false },
      { text: 'Chair', requiresPhoto: false, requiresCount: false },
      { text: 'End Tables', requiresPhoto: false, requiresCount: false },
      { text: 'Coffee Table', requiresPhoto: false, requiresCount: false },
      { text: 'Dish Box', requiresPhoto: false, requiresCount: false },
      { text: 'Dish Remote', requiresPhoto: false, requiresCount: false },
      { text: 'DVD Player', requiresPhoto: false, requiresCount: false },
      { text: 'DVD Remote', requiresPhoto: false, requiresCount: false },
      { text: 'Stereo', requiresPhoto: false, requiresCount: false },
      { text: 'Surge Protector', requiresPhoto: false, requiresCount: false },
      // Inspection items
      { text: 'Furniture setup, clean and dusted.', requiresPhoto: false, requiresCount: false },
      { text: 'Lamps and overhead lights/fan working and clean.', requiresPhoto: false, requiresCount: false },
      { text: 'Television and remotes working.', requiresPhoto: true, requiresCount: false },
      { text: 'Carpet/flooring clean and in good condition.', requiresPhoto: true, requiresCount: false },
      { text: 'Photo: Full view.', requiresPhoto: true, requiresCount: false }
    ]
  },
  {
    key: 'office',
    title: 'Office',
    items: [
      // Checklist items
      { text: 'Wireless Router', requiresPhoto: false, requiresCount: false },
      { text: 'WiFi SSID', requiresPhoto: false, requiresCount: false },
      { text: 'WiFi Password', requiresPhoto: false, requiresCount: false },
      // Inspection items
      { text: 'Furniture setup, clean and dusted.', requiresPhoto: true, requiresCount: false },
      { text: 'Chair is sturdy. If it has wheels, they roll properly.', requiresPhoto: false, requiresCount: false },
      { text: 'Lamps and overhead lights/fan working and clean.', requiresPhoto: false, requiresCount: false },
      { text: 'Shelves clean and free of dust.', requiresPhoto: false, requiresCount: false },
      { text: 'Photo: Full view.', requiresPhoto: true, requiresCount: false }
    ]
  },
  {
    key: 'kitchen',
    title: 'Kitchen',
    hint: 'Please take photos of the outside/inside of all appliances.',
    items: [
      // Checklist items - Kitchen Tools & Utensils
      { text: 'Baking Dish', requiresPhoto: false, requiresCount: false },
      { text: 'Broiler Pan', requiresPhoto: false, requiresCount: false },
      { text: 'Can Opener', requiresPhoto: false, requiresCount: false },
      { text: 'Colander', requiresPhoto: false, requiresCount: false },
      { text: 'Cookie Sheet', requiresPhoto: false, requiresCount: false },
      { text: 'Corkscrew', requiresPhoto: false, requiresCount: false },
      { text: 'Cutting Board', requiresPhoto: false, requiresCount: false },
      { text: 'Cheese Grater', requiresPhoto: false, requiresCount: false },
      { text: 'Knife Block with Steak Knives', requiresPhoto: false, requiresCount: false },
      { text: 'Ice Cream Scoop', requiresPhoto: false, requiresCount: false },
      { text: 'Ladle', requiresPhoto: false, requiresCount: false },
      { text: 'Measuring Cup (2 cup)', requiresPhoto: false, requiresCount: false },
      { text: 'Measuring Cup Set', requiresPhoto: false, requiresCount: false },
      { text: 'Measuring Spoon Set', requiresPhoto: false, requiresCount: false },
      { text: 'Mixing Bowls (3)', requiresPhoto: false, requiresCount: false },
      { text: 'Pizza Cutter', requiresPhoto: false, requiresCount: false },
      { text: 'Salt and Pepper', requiresPhoto: false, requiresCount: false },
      { text: 'Baking Spatula', requiresPhoto: false, requiresCount: false },
      { text: 'Flipper Spatula', requiresPhoto: false, requiresCount: false },
      { text: 'Cooking Spoon', requiresPhoto: false, requiresCount: false },
      { text: 'Slotted Spoons', requiresPhoto: false, requiresCount: false },
      { text: 'Tea Kettle', requiresPhoto: false, requiresCount: false },
      { text: 'Tongs', requiresPhoto: false, requiresCount: false },
      { text: 'Vegetable Peeler', requiresPhoto: false, requiresCount: false },
      { text: 'Tupperware Set', requiresPhoto: false, requiresCount: false },
      { text: 'Utensil Holder (Counter)', requiresPhoto: false, requiresCount: false },
      { text: 'Utensil Holder (Drawer)', requiresPhoto: false, requiresCount: false },
      { text: 'Glass Water Pitcher', requiresPhoto: false, requiresCount: false },
      // Checklist items - Kitchen Dishes and Glassware
      { text: '8 Large Plates', requiresPhoto: false, requiresCount: false },
      { text: '8 Small Plates', requiresPhoto: false, requiresCount: false },
      { text: '8 Bowls', requiresPhoto: false, requiresCount: false },
      { text: '8 Tall Glasses', requiresPhoto: false, requiresCount: false },
      { text: '8 Medium Glasses', requiresPhoto: false, requiresCount: false },
      { text: '8 Wine Glasses', requiresPhoto: false, requiresCount: false },
      { text: '8 Coffee Mugs', requiresPhoto: false, requiresCount: false },
      { text: '8 Forks', requiresPhoto: false, requiresCount: false },
      { text: '8 Spoons', requiresPhoto: false, requiresCount: false },
      { text: '8 Knives', requiresPhoto: false, requiresCount: false },
      { text: 'Cutlery Tray', requiresPhoto: false, requiresCount: false },
      // Checklist items - Kitchen Pots and Cookware
      { text: 'Large Frying Pan with Lid', requiresPhoto: false, requiresCount: false },
      { text: 'Small Frying Pan with Lid', requiresPhoto: false, requiresCount: false },
      { text: 'Large Sauce Pan with Lid', requiresPhoto: false, requiresCount: false },
      { text: 'Small Sauce Pan with Lid', requiresPhoto: false, requiresCount: false },
      { text: 'Pasta Pot with Lid', requiresPhoto: false, requiresCount: false },
      // Checklist items - Kitchen Linens and Misc
      { text: 'Dish Towels', requiresPhoto: false, requiresCount: false },
      { text: 'Dish Cloths', requiresPhoto: false, requiresCount: false },
      { text: 'Potholders (2)', requiresPhoto: false, requiresCount: false },
      { text: 'Placemats (4)', requiresPhoto: false, requiresCount: false },
      { text: 'Napkins (4)', requiresPhoto: false, requiresCount: false },
      { text: 'Trash Can', requiresPhoto: false, requiresCount: false },
      { text: 'Fire Extinguisher', requiresPhoto: false, requiresCount: false },
      { text: 'Kitchen Rug', requiresPhoto: false, requiresCount: false },
      // Inspection items
      { text: 'Kitchen floors and countertops clean.', requiresPhoto: false, requiresCount: false },
      { text: 'Housewares are clean and in place.', requiresPhoto: false, requiresCount: false },
      { text: 'Refrigerator/freezer working and clean.', requiresPhoto: false, requiresCount: false },
      { text: 'Microwave, stove, hood, and burners clean and working.', requiresPhoto: true, requiresCount: false },
      { text: 'Oven clean and working.', requiresPhoto: true, requiresCount: false },
      { text: 'Dishwasher and disposal working, no leaks.', requiresPhoto: false, requiresCount: false },
      { text: 'Kitchen faucet works with hot/cold water.', requiresPhoto: false, requiresCount: false },
      { text: 'Starter kit provided.', requiresPhoto: true, requiresCount: false },
      { text: 'Photo: Full view.', requiresPhoto: true, requiresCount: false }
    ]
  },
  {
    key: 'bedroom',
    title: 'Bedroom',
    items: [
      // Checklist items
      { text: 'Bed Frame', requiresPhoto: false, requiresCount: false },
      { text: 'Headboard', requiresPhoto: false, requiresCount: false },
      { text: 'Mattress', requiresPhoto: false, requiresCount: false },
      { text: 'Mattress Pad', requiresPhoto: false, requiresCount: false },
      { text: 'Sheet Set', requiresPhoto: false, requiresCount: false },
      { text: 'Pillows', requiresPhoto: false, requiresCount: false },
      { text: 'Blanket', requiresPhoto: false, requiresCount: false },
      { text: 'Bedspread', requiresPhoto: false, requiresCount: false },
      { text: 'Shams', requiresPhoto: false, requiresCount: false },
      { text: 'Dresser', requiresPhoto: false, requiresCount: false },
      { text: 'Night Stand', requiresPhoto: false, requiresCount: false },
      { text: 'Table Lamp', requiresPhoto: false, requiresCount: false },
      { text: 'Ceiling Fan', requiresPhoto: false, requiresCount: false },
      { text: 'Ceiling Fan Remote', requiresPhoto: false, requiresCount: false },
      { text: 'Flat Screen TV', requiresPhoto: true, requiresCount: false },
      { text: 'TV Remote', requiresPhoto: false, requiresCount: false },
      { text: 'Cable Box', requiresPhoto: false, requiresCount: false },
      { text: 'Cable Remote', requiresPhoto: false, requiresCount: false },
      { text: 'Clock Radio / iPod Dock', requiresPhoto: false, requiresCount: false },
      // Inspection items
      { text: 'Mattress checked (no stains/bedbugs).', requiresPhoto: true, requiresCount: false },
      { text: 'Beds neatly made; bedding and pillows in good condition.', requiresPhoto: false, requiresCount: false },
      { text: 'Bedroom furniture in good condition.', requiresPhoto: false, requiresCount: false },
      { text: 'Television and remotes working.', requiresPhoto: true, requiresCount: false },
      { text: 'Lights/fans and remotes working.', requiresPhoto: false, requiresCount: false },
      { text: 'Closet and drawers clean and organized.', requiresPhoto: false, requiresCount: false },
      { text: 'Photo: Full view.', requiresPhoto: true, requiresCount: false }
    ]
  },
  {
    key: 'bathroom',
    title: 'Bathroom',
    items: [
      // Checklist items
      { text: 'Bath Towels (4)', requiresPhoto: false, requiresCount: false },
      { text: 'Hand Towels (4)', requiresPhoto: false, requiresCount: false },
      { text: 'Face Towels (4)', requiresPhoto: false, requiresCount: false },
      { text: 'Bath Mat', requiresPhoto: false, requiresCount: false },
      { text: 'Bath Rug', requiresPhoto: false, requiresCount: false },
      { text: 'Soap Dish', requiresPhoto: false, requiresCount: false },
      { text: 'Plunger', requiresPhoto: false, requiresCount: false },
      { text: 'Toilet Brush', requiresPhoto: false, requiresCount: false },
      { text: 'Trash Can', requiresPhoto: false, requiresCount: false },
      { text: 'Shower Curtain or Glass Door', requiresPhoto: false, requiresCount: false },
      { text: 'Shower Curtain Liner', requiresPhoto: false, requiresCount: false },
      // Inspection items
      { text: 'Tub/shower clean, draining, and no mold.', requiresPhoto: true, requiresCount: false },
      { text: 'Sink hot/cold tested and no leaks.', requiresPhoto: true, requiresCount: false },
      { text: 'Toilet clean, flushes properly, and no leaks.', requiresPhoto: true, requiresCount: false },
      { text: 'Towels/liner/rug clean and in good condition.', requiresPhoto: false, requiresCount: false },
      { text: 'Starter kit provided.', requiresPhoto: false, requiresCount: false },
      { text: 'Photo: Full view.', requiresPhoto: true, requiresCount: false }
    ]
  },
  {
    key: 'utilityRoom',
    title: 'Utility Room',
    items: [
      // Checklist items - Filters and Bulbs
      { text: 'Spare Filters in Unit', requiresPhoto: false, requiresCount: false },
      { text: 'Filters Need Replacing', requiresPhoto: false, requiresCount: false },
      { text: 'Need to Purchase More Filters', requiresPhoto: false, requiresCount: false },
      { text: 'Filter Size', requiresPhoto: false, requiresCount: false },
      { text: 'Spare Bulbs in Unit', requiresPhoto: false, requiresCount: false },
      { text: 'Bulbs Need Replacing', requiresPhoto: false, requiresCount: false },
      { text: 'Need to Purchase More Bulbs', requiresPhoto: false, requiresCount: false },
      { text: 'Specialty Bulbs Needed', requiresPhoto: false, requiresCount: false },
      // Checklist items - Cleaning and Laundry
      { text: 'Vacuum', requiresPhoto: false, requiresCount: false },
      { text: 'Mop', requiresPhoto: false, requiresCount: false },
      { text: 'Broom', requiresPhoto: false, requiresCount: false },
      { text: 'Dust Pan', requiresPhoto: false, requiresCount: false },
      { text: 'Bucket', requiresPhoto: false, requiresCount: false },
      { text: 'Iron', requiresPhoto: false, requiresCount: false },
      { text: 'Ironing Board', requiresPhoto: false, requiresCount: false },
      { text: 'Ironing Board Cover', requiresPhoto: false, requiresCount: false },
      { text: 'Step Ladder', requiresPhoto: false, requiresCount: false },
      // Inspection items
      { text: 'Iron and ironing board in good condition.', requiresPhoto: false, requiresCount: false },
      { text: 'Vacuum empty, clean, and working.', requiresPhoto: false, requiresCount: false },
      { text: 'Broom, dustpan, and mop in good condition.', requiresPhoto: false, requiresCount: false },
      { text: 'Washer and dryer working with no leaks/odor.', requiresPhoto: true, requiresCount: false },
      { text: 'HVAC working', requiresPhoto: true, requiresCount: false },
      { text: 'Water Heater working', requiresPhoto: true, requiresCount: false },
      { text: 'Thermostat working', requiresPhoto: false, requiresCount: false },
      { text: 'Photo: Full view.', requiresPhoto: true, requiresCount: false }
    ]
  },
  {
    key: 'garage',
    title: 'Garage',
    items: [
      { text: 'Clean and swept of all debris.', requiresPhoto: false, requiresCount: false },
      { text: 'Trash cans inside and emptied.', requiresPhoto: false, requiresCount: false },
      { text: 'Garage door openers accounted for and ready for tenants.', requiresPhoto: false, requiresCount: false },
      { text: 'Garage door working', requiresPhoto: false, requiresCount: false },
      { text: 'Photo: Full view.', requiresPhoto: true, requiresCount: false }
    ]
  },
  {
    key: 'mustHavePhotosVideos',
    title: 'Must Have Photos / Videos',
    items: [
      { text: 'Unit access key/code working (video).', requiresPhoto: true, requiresCount: false },
      { text: 'WiFi connection and speed screenshots.', requiresPhoto: true, requiresCount: false },
      { text: 'Mailbox key and number photo.', requiresPhoto: true, requiresCount: false },
      { text: 'Welcome basket photo.', requiresPhoto: true, requiresCount: false },
      { text: 'Parking/garage access and remote proof.', requiresPhoto: true, requiresCount: false },
      { text: 'Lockbox Location.', requiresPhoto: true, requiresCount: false },
      { text: 'Lockbox open with key inside.', requiresPhoto: true, requiresCount: false }
    ]
  },
  {
    key: 'cleaningStatus',
    title: 'Cleaning Status',
    selectionMode: 'atLeastOne',
    items: [
      { text: 'Cleaning Done', requiresPhoto: false, requiresCount: false },
      { text: 'Needs to be Redone', requiresPhoto: false, requiresCount: false },
      { text: 'Not Done', requiresPhoto: false, requiresCount: false },
      { text: 'Spot Clean Carpets', requiresPhoto: false, requiresCount: false },
      { text: 'Whole Carpet Clean', requiresPhoto: false, requiresCount: false }
    ]
  }
];
