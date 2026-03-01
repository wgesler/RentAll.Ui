export type ChecklistSection = {
  key: string;
  title: string;
  hint?: string;
  items: string[];
};

export type ChecklistItem = {
  id: string;
  text: string;
  isEditable: boolean;
  checked?: boolean;
};

export const CHECKLIST_SECTIONS: ChecklistSection[] = [
  {
    key: 'frontEntrance',
    title: 'Front Entrance',
    items: [
      'Entrance is free of debris and cobwebs.',
      'Front and sliding glass doors clean. Doorknob/handle secured.',
      'Door(s) close securely and are locked.',
      'Outside light working.',
      'Entry mat clean and in good condition.'
    ]
  },
  {
    key: 'diningRoom',
    title: 'Dining Room',
    items: [
      'Dining room table and chairs sturdy, clean and in good condition.',
      '2-place settings set out on the table.',
      'Flooring/carpet clean and in good condition.'
    ]
  },
  {
    key: 'livingRoom',
    title: 'Living Room',
    items: [
      'Furniture setup, clean and dusted.',
      'Lamps and overhead lights/fan working and clean.',
      'Television and remotes working.',
      'Carpet/flooring clean and in good condition.'
    ]
  },
  {
    key: 'kitchen',
    title: 'Kitchen',
    hint: 'Please take photos of the outside/inside of all appliances.',
    items: [
      'Kitchen floors and countertops clean.',
      'Housewares are clean and in place.',
      'Refrigerator/freezer working and clean.',
      'Microwave, stove, hood, and oven clean and working.',
      'Dishwasher and disposal working, no leaks.',
      'Kitchen faucet works with hot/cold water.',
      'Starter kit provided.'
    ]
  },
  {
    key: 'bedrooms',
    title: 'Bedrooms',
    items: [
      'Mattress checked (no stains/bedbugs).',
      'Beds neatly made; bedding and pillows in good condition.',
      'Bedroom furniture in good condition.',
      'Lights/fans and remotes working.',
      'Closet and drawers clean and organized.'
    ]
  },
  {
    key: 'bathrooms',
    title: 'Bathrooms',
    items: [
      'Tub/shower clean, draining, and no mold.',
      'Sink hot/cold tested and no leaks.',
      'Toilet clean, flushes properly, and no leaks.',
      'Towels/liner/rug clean and in good condition.',
      'Starter kit provided.'
    ]
  },
  {
    key: 'utilityRoom',
    title: 'Utility Room',
    items: [
      'Iron and ironing board in good condition.',
      'Vacuum empty, clean, and working.',
      'Broom, dustpan, and mop in good condition.',
      'Washer and dryer working with no leaks/odor.'
    ]
  },
  {
    key: 'garage',
    title: 'Garage',
    items: [
      'Clean and swept of all debris.',
      'Trash cans inside and emptied.',
      'Garage door openers accounted for and ready for tenants.'
    ]
  },
  {
    key: 'mustHavePhotosVideos',
    title: 'Must Have Photos / Videos',
    items: [
      'Unit access key/code working (video).',
      'WiFi connection and speed screenshots.',
      'Mailbox key and number photo.',
      'Welcome basket photo.',
      'Parking/garage access and remote proof.'
    ]
  }
];
