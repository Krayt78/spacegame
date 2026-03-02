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
    reward: { titanium: 100, helium3: 50, darkMatter: 0 },
  },
  {
    id: 2,
    name: 'Into the Void',
    description: 'Build a Dark Matter Collector (Level 1)',
    tip: "Dark Matter is rare but essential. You'll need it for the Shipyard and Research Node.",
    reward: { titanium: 100, helium3: 50, darkMatter: 0 },
  },
  {
    id: 3,
    name: 'Growing Economy',
    description: 'Reach Titanium Extractor Level 3 and Helium-3 Harvester Level 3',
    tip: 'Scaling production early pays dividends. Higher level mines produce significantly more per hour.',
    reward: { titanium: 350, helium3: 100, darkMatter: 100 },
  },
  {
    id: 4,
    name: 'Dark Expansion',
    description: 'Upgrade Dark Matter Collector to Level 2',
    tip: "Upgrading your Dark Matter Collector increases DM production. You'll need DM to build a Shipyard.",
    reward: { titanium: 400, helium3: 50, darkMatter: 200 },
  },
  {
    id: 5,
    name: 'Industrial Might',
    description: 'Reach Titanium Extractor Level 4 and Helium-3 Harvester Level 4',
    tip: 'A strong resource base is the foundation of any great empire. Keep scaling your production!',
    reward: { titanium: 500, helium3: 50, darkMatter: 100 },
  },
  {
    id: 6,
    name: 'Dark Mastery',
    description: 'Upgrade Dark Matter Collector to Level 3',
    tip: 'Dark Matter fuels your most advanced buildings. A higher collector means faster progress.',
    reward: { titanium: 500, helium3: 250, darkMatter: 100 },
  },
  {
    id: 7,
    name: 'The Forge',
    description: 'Build a Shipyard (Level 1)',
    tip: "The Shipyard unlocks ship construction. Combined with research, you'll be building fleets in no time.",
    reward: { titanium: 250, helium3: 450, darkMatter: 200 },
  },
  {
    id: 8,
    name: 'Knowledge is Power',
    description: 'Build a Research Node (Level 1)',
    tip: 'The Research Node enables technology research. You need Combustion Drive before you can build ships.',
    reward: { titanium: 450, helium3: 50, darkMatter: 300 },
  },
  {
    id: 9,
    name: 'First Research',
    description: 'Research Combustion Drive Level 1',
    tip: 'Combustion Drive is the prerequisite for Light Fighters. Research it at the Research Node.',
    reward: { titanium: 700, helium3: 300, darkMatter: 0 },
  },
  {
    id: 10,
    name: 'Economic Powerhouse',
    description: 'Reach Titanium Extractor Level 5 and Helium-3 Harvester Level 5',
    tip: 'Your economy is maturing. High-level extractors generate resources at an impressive rate.',
    reward: { titanium: 800, helium3: 300, darkMatter: 0 },
  },
  {
    id: 11,
    name: 'Dark Dominion',
    description: 'Upgrade Dark Matter Collector to Level 4',
    tip: 'With a Level 4 collector, your Dark Matter supply is now self-sustaining for most needs.',
    reward: { titanium: 500, helium3: 150, darkMatter: 0 },
  },
  {
    id: 12,
    name: 'Titanium Empire',
    description: 'Upgrade Titanium Extractor to Level 6',
    tip: 'A Level 6 Titanium Extractor is a powerhouse. Your economy is ready for fleet construction.',
    reward: { titanium: 1100, helium3: 100, darkMatter: 0 },
  },
  {
    id: 13,
    name: 'Safe Storage',
    description: 'Build any Storage building (Titanium Vault, Helium-3 Tank, or Dark Matter Containment)',
    tip: 'Without storage buildings you rely on the default 100k capacity. Build storage to protect against overflow.',
    reward: { titanium: 3200, helium3: 1200, darkMatter: 0 },
  },
  {
    id: 14,
    name: 'Maiden Voyage',
    description: 'Build 1 Light Fighter',
    tip: "Light Fighters cost 3,000 Ti / 1,000 He3 each. They're cheap but effective scouts.",
    reward: { titanium: 12500, helium3: 4500, darkMatter: 0 },
  },
  {
    id: 15,
    name: 'Fleet Command',
    description: 'Research Computer Technology Level 1',
    tip: 'Computer Tech determines how many fleets you can send simultaneously. Level 1 unlocks your first fleet slot.',
    reward: { titanium: 3000, helium3: 2000, darkMatter: 500 },
  },
  {
    id: 16,
    name: 'Battle Ready',
    description: 'Build a fleet of 5 Light Fighters',
    tip: "A small fleet is better than no fleet. You're ready to explore the galaxy, Commander!",
    reward: { titanium: 5000, helium3: 3000, darkMatter: 1000 },
  },
];
