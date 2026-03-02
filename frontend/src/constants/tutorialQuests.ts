export interface TutorialQuest {
  id: number;
  name: string;
  description: string;
  tip: string;
  reward: { titanium: number; helium3: number; darkMatter: number };
}

export const TUTORIAL_QUESTS: TutorialQuest[] = [
  {
    id: 0,
    name: 'Power Up',
    description: 'Upgrade Titanium Extractor to Level 2',
    tip: 'Your Titanium Extractor is your lifeline. Upgrading it increases production permanently.',
    reward: { titanium: 100, helium3: 50, darkMatter: 0 },
  },
  {
    id: 1,
    name: 'Fuel Reserves',
    description: 'Upgrade Helium-3 Harvester to Level 2',
    tip: "Helium-3 powers advanced technology and ships. You'll need a lot of it later.",
    reward: { titanium: 50, helium3: 100, darkMatter: 0 },
  },
  {
    id: 2,
    name: 'Into the Void',
    description: 'Build a Dark Matter Collector (Level 1)',
    tip: "Dark Matter is rare but essential. You'll need it for the Shipyard and Research Node.",
    reward: { titanium: 150, helium3: 100, darkMatter: 0 },
  },
  {
    id: 3,
    name: 'Growing Economy',
    description: 'Reach Titanium Extractor Level 3 and Helium-3 Harvester Level 3',
    tip: 'Scaling production early pays dividends. Higher level mines produce significantly more per hour.',
    reward: { titanium: 200, helium3: 100, darkMatter: 50 },
  },
  {
    id: 4,
    name: 'Dark Expansion',
    description: 'Upgrade Dark Matter Collector to Level 2',
    tip: "Upgrading your Dark Matter Collector increases DM production. You'll need DM to build a Shipyard.",
    reward: { titanium: 100, helium3: 50, darkMatter: 50 },
  },
  {
    id: 5,
    name: 'Safe Storage',
    description: 'Build any Storage building (Titanium Vault, Helium-3 Tank, or Dark Matter Containment)',
    tip: 'Without storage buildings you rely on the default 100k capacity. Build storage to protect against overflow.',
    reward: { titanium: 150, helium3: 150, darkMatter: 0 },
  },
  {
    id: 6,
    name: 'The Forge',
    description: 'Build a Shipyard (Level 1)',
    tip: "The Shipyard unlocks ship construction. Combined with research, you'll be building fleets in no time.",
    reward: { titanium: 300, helium3: 200, darkMatter: 200 },
  },
  {
    id: 7,
    name: 'Knowledge is Power',
    description: 'Build a Research Node (Level 1)',
    tip: 'The Research Node enables technology research. You need Combustion Drive before you can build ships.',
    reward: { titanium: 200, helium3: 200, darkMatter: 100 },
  },
  {
    id: 8,
    name: 'First Research',
    description: 'Research Combustion Drive Level 1',
    tip: 'Combustion Drive is the prerequisite for Light Fighters. Research it at the Research Node.',
    reward: { titanium: 200, helium3: 100, darkMatter: 0 },
  },
  {
    id: 9,
    name: 'Maiden Voyage',
    description: 'Build 1 Light Fighter',
    tip: "Light Fighters cost 3,000 Ti / 1,000 He3 each. They're cheap but effective scouts.",
    reward: { titanium: 300, helium3: 200, darkMatter: 0 },
  },
  {
    id: 10,
    name: 'Battle Ready',
    description: 'Build a fleet of 5 Light Fighters',
    tip: "A small fleet is better than no fleet. You're ready to explore the galaxy, Commander!",
    reward: { titanium: 500, helium3: 300, darkMatter: 100 },
  },
];
