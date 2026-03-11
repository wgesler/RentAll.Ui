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
  /** Server path (PhotoResponse.photoPath); persisted in saved checklist. */
  photoPath?: string | null;
  /** In-memory only: data URL for preview right after upload; not saved. */
  displayDataUrl?: string | null;
  documentId?: string | null;
  isEditable: boolean;
  checked?: boolean;
};

export type SavedChecklistItem = {
  text: string;
  requiresPhoto: boolean;
  photoPath?: string | null;
  documentId?: string | null;
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
    key: 'keysAndAccess',
    title: 'Keys and Access',
    items: [
      { text: 'Unit Keys (1,2,3)', requiresPhoto: false },
      { text: 'Mail Keys (1,2,3)', requiresPhoto: false },
      { text: 'Building Keys (1,2,3)', requiresPhoto: false },
      { text: 'Garage Remotes (1,2,3)', requiresPhoto: false },
      { text: 'FOB (1,2,3)', requiresPhoto: false },
      { text: 'Amenities Access', requiresPhoto: false }
    ]
  },
  {
    key: 'cleaningStatus',
    title: 'Cleaning Status',
    items: [
      { text: 'Cleaning Done', requiresPhoto: false },
      { text: 'Needs to be Redone', requiresPhoto: false },
      { text: 'Not Done', requiresPhoto: false },
      { text: 'Spot Clean Carpets', requiresPhoto: false },
      { text: 'Whole Carpet Clean', requiresPhoto: false }
    ]
  },
  {
    key: 'filtersAndBulbs',
    title: 'Filters and Bulbs',
    items: [
      { text: 'Spare Filters in Unit', requiresPhoto: false },
      { text: 'Filters Need Replacing', requiresPhoto: false },
      { text: 'Need to Purchase More Filters', requiresPhoto: false },
      { text: 'Filter Size', requiresPhoto: false },
      { text: 'Spare Bulbs in Unit', requiresPhoto: false },
      { text: 'Bulbs Need Replacing', requiresPhoto: false },
      { text: 'Need to Purchase More Bulbs', requiresPhoto: false },
      { text: 'Specialty Bulbs Needed', requiresPhoto: false }
    ]
  },
  {
    key: 'kitchenTools',
    title: 'Kitchen – Tools & Utensils',
    items: [
      { text: 'Baking Dish', requiresPhoto: false },
      { text: 'Broiler Pan', requiresPhoto: false },
      { text: 'Can Opener', requiresPhoto: false },
      { text: 'Colander', requiresPhoto: false },
      { text: 'Cookie Sheet', requiresPhoto: false },
      { text: 'Corkscrew', requiresPhoto: false },
      { text: 'Cutting Board', requiresPhoto: false },
      { text: 'Cheese Grater', requiresPhoto: false },
      { text: 'Knife Block with Steak Knives', requiresPhoto: false },
      { text: 'Ice Cream Scoop', requiresPhoto: false },
      { text: 'Ladle', requiresPhoto: false },
      { text: 'Measuring Cup (2 cup)', requiresPhoto: false },
      { text: 'Measuring Cup Set', requiresPhoto: false },
      { text: 'Measuring Spoon Set', requiresPhoto: false },
      { text: 'Mixing Bowls (3)', requiresPhoto: false },
      { text: 'Pizza Cutter', requiresPhoto: false },
      { text: 'Salt and Pepper', requiresPhoto: false },
      { text: 'Baking Spatula', requiresPhoto: false },
      { text: 'Flipper Spatula', requiresPhoto: false },
      { text: 'Cooking Spoon', requiresPhoto: false },
      { text: 'Slotted Spoons', requiresPhoto: false },
      { text: 'Tea Kettle', requiresPhoto: false },
      { text: 'Tongs', requiresPhoto: false },
      { text: 'Vegetable Peeler', requiresPhoto: false },
      { text: 'Tupperware Set', requiresPhoto: false },
      { text: 'Utensil Holder (Counter)', requiresPhoto: false },
      { text: 'Utensil Holder (Drawer)', requiresPhoto: false },
      { text: 'Glass Water Pitcher', requiresPhoto: false }
    ]
  },
  {
    key: 'kitchenDishes',
    title: 'Kitchen – Dishes and Glassware',
    items: [
      { text: '8 Large Plates', requiresPhoto: false },
      { text: '8 Small Plates', requiresPhoto: false },
      { text: '8 Bowls', requiresPhoto: false },
      { text: '8 Tall Glasses', requiresPhoto: false },
      { text: '8 Medium Glasses', requiresPhoto: false },
      { text: '8 Wine Glasses', requiresPhoto: false },
      { text: '8 Coffee Mugs', requiresPhoto: false },
      { text: '8 Forks', requiresPhoto: false },
      { text: '8 Spoons', requiresPhoto: false },
      { text: '8 Knives', requiresPhoto: false },
      { text: 'Cutlery Tray', requiresPhoto: false }
    ]
  },
  {
    key: 'kitchenCookware',
    title: 'Kitchen – Pots and Cookware',
    items: [
      { text: 'Large Frying Pan with Lid', requiresPhoto: false },
      { text: 'Small Frying Pan with Lid', requiresPhoto: false },
      { text: 'Large Sauce Pan with Lid', requiresPhoto: false },
      { text: 'Small Sauce Pan with Lid', requiresPhoto: false },
      { text: 'Pasta Pot with Lid', requiresPhoto: false }
    ]
  },
  {
    key: 'kitchenLinens',
    title: 'Kitchen – Linens and Misc',
    items: [
      { text: 'Dish Towels', requiresPhoto: false },
      { text: 'Dish Cloths', requiresPhoto: false },
      { text: 'Potholders (2)', requiresPhoto: false },
      { text: 'Placemats (4)', requiresPhoto: false },
      { text: 'Napkins (4)', requiresPhoto: false },
      { text: 'Trash Can', requiresPhoto: false },
      { text: 'Fire Extinguisher', requiresPhoto: false },
      { text: 'Kitchen Rug', requiresPhoto: false }
    ]
  },
  {
    key: 'livingRoom',
    title: 'Living Room',
    items: [
      { text: 'Flat Screen TV', requiresPhoto: true },
      { text: 'TV Remote', requiresPhoto: false },
      { text: 'TV Stand', requiresPhoto: false },
      { text: 'Couch', requiresPhoto: false },
      { text: 'Chair', requiresPhoto: false },
      { text: 'End Tables', requiresPhoto: false },
      { text: 'Coffee Table', requiresPhoto: false },
      { text: 'Dish Box', requiresPhoto: false },
      { text: 'Dish Remote', requiresPhoto: false },
      { text: 'DVD Player', requiresPhoto: false },
      { text: 'DVD Remote', requiresPhoto: false },
      { text: 'Stereo', requiresPhoto: false },
      { text: 'Surge Protector', requiresPhoto: false }
    ]
  },
  {
    key: 'bedroom',
    title: 'Bedroom',
    items: [
      { text: 'Bed Frame', requiresPhoto: false },
      { text: 'Headboard', requiresPhoto: false },
      { text: 'Mattress', requiresPhoto: false },
      { text: 'Mattress Pad', requiresPhoto: false },
      { text: 'Sheet Set', requiresPhoto: false },
      { text: 'Pillows', requiresPhoto: false },
      { text: 'Blanket', requiresPhoto: false },
      { text: 'Bedspread', requiresPhoto: false },
      { text: 'Shams', requiresPhoto: false },
      { text: 'Dresser', requiresPhoto: false },
      { text: 'Night Stand', requiresPhoto: false },
      { text: 'Table Lamp', requiresPhoto: false },
      { text: 'Ceiling Fan', requiresPhoto: false },
      { text: 'Ceiling Fan Remote', requiresPhoto: false },
      { text: 'Flat Screen TV', requiresPhoto: true },
      { text: 'TV Remote', requiresPhoto: false },
      { text: 'Cable Box', requiresPhoto: false },
      { text: 'Cable Remote', requiresPhoto: false },
      { text: 'Clock Radio / iPod Dock', requiresPhoto: false }
    ]
  },
  {
    key: 'bathroom',
    title: 'Bathroom',
    items: [
      { text: 'Bath Towels (4)', requiresPhoto: false },
      { text: 'Hand Towels (4)', requiresPhoto: false },
      { text: 'Face Towels (4)', requiresPhoto: false },
      { text: 'Bath Mat', requiresPhoto: false },
      { text: 'Bath Rug', requiresPhoto: false },
      { text: 'Soap Dish', requiresPhoto: false },
      { text: 'Plunger', requiresPhoto: false },
      { text: 'Toilet Brush', requiresPhoto: false },
      { text: 'Trash Can', requiresPhoto: false },
      { text: 'Shower Curtain or Glass Door', requiresPhoto: false },
      { text: 'Shower Curtain Liner', requiresPhoto: false }
    ]
  },
  {
    key: 'cleaningLaundry',
    title: 'Cleaning and Laundry',
    items: [
      { text: 'Vacuum', requiresPhoto: false },
      { text: 'Mop', requiresPhoto: false },
      { text: 'Broom', requiresPhoto: false },
      { text: 'Dust Pan', requiresPhoto: false },
      { text: 'Bucket', requiresPhoto: false },
      { text: 'Iron', requiresPhoto: false },
      { text: 'Ironing Board', requiresPhoto: false },
      { text: 'Ironing Board Cover', requiresPhoto: false },
      { text: 'Step Ladder', requiresPhoto: false }
    ]
  },
  {
    key: 'officeArea',
    title: 'Office / Internet',
    items: [
      { text: 'Wireless Router', requiresPhoto: false },
      { text: 'WiFi SSID', requiresPhoto: false },
      { text: 'WiFi Password', requiresPhoto: false }
    ]
  },
  {
    key: 'appliances',
    title: 'Appliances and Systems',
    hint: 'Capture model and serial numbers where available.',
    items: [
      { text: 'Refrigerator', requiresPhoto: true },
      { text: 'Stove / Oven', requiresPhoto: true },
      { text: 'Microwave', requiresPhoto: true },
      { text: 'Dishwasher', requiresPhoto: true },
      { text: 'Garbage Disposal', requiresPhoto: false },
      { text: 'Washer', requiresPhoto: true },
      { text: 'Dryer', requiresPhoto: true },
      { text: 'HVAC', requiresPhoto: true },
      { text: 'Water Heater', requiresPhoto: true },
      { text: 'Thermostat', requiresPhoto: false },
      { text: 'Garage Door', requiresPhoto: false },
      { text: 'Main Room TV', requiresPhoto: true },
      { text: 'Primary Bedroom TV', requiresPhoto: true },
      { text: 'Guest Bedroom TV', requiresPhoto: true }
    ]
  }
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
    key: 'office',
    title: 'Office',
    items: [
      { text: 'Furniture setup, clean and dusted.', requiresPhoto: true },
      { text: 'Chair is sturdy. If it has wheels, they roll properly.', requiresPhoto: false },
      { text: 'Lamps and overhead lights/fan working and clean.', requiresPhoto: false },
      { text: 'Shelves clean and free of dust.', requiresPhoto: false }
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
