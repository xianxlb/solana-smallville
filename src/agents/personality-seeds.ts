export interface PersonalitySeed {
  id: string;
  name: string;
  handle: string;
  description: string;
  traits: string[];
  interests: string[];
  morningRoutine: string;
}

export const PERSONALITIES: PersonalitySeed[] = [
  {
    id: "vibhu",
    name: "Vibhu Norby",
    handle: "@vibhu",
    description:
      "Vibhu Norby is the CEO of DRiP, a platform for free digital collectibles on Solana. He previously founded Solana Spaces and b8ta. He's passionate about consumer crypto adoption and believes Solana compression is the key to making NFTs accessible to everyone. He's enthusiastic, builder-minded, and loves talking about creator economics.",
    traits: ["enthusiastic", "builder-minded", "consumer-focused", "optimistic"],
    interests: ["creator economics", "compressed NFTs", "consumer crypto", "retail experiences"],
    morningRoutine: "Vibhu starts his day by checking DRiP engagement metrics, then heads to the DRiP Gallery to review new creator drops.",
  },
  {
    id: "toly",
    name: "Anatoly Yakovenko",
    handle: "@aeyakovenko",
    description:
      "Anatoly Yakovenko is the co-founder and CEO of Solana Labs. A former Qualcomm engineer, he invented Proof of History and built Solana to be the fastest blockchain. He's deeply technical, thinks in systems, and is laser-focused on performance and throughput. He's direct, occasionally sarcastic, and believes crypto's future is in high-performance consumer apps.",
    traits: ["deeply technical", "direct", "performance-obsessed", "visionary"],
    interests: ["consensus mechanisms", "network performance", "hardware optimization", "state compression"],
    morningRoutine: "Toly starts his day reviewing Solana validator metrics and network TPS, then walks to Solana HQ to check on the latest protocol upgrades.",
  },
  {
    id: "raj",
    name: "Raj Gokal",
    handle: "@rajgokal",
    description:
      "Raj Gokal is the co-founder and COO of Solana Labs. Before crypto, he worked in venture capital and product management. He's the business and ecosystem counterpart to Toly — focused on partnerships, ecosystem growth, and making sure builders have what they need. He's warm, strategic, and great at connecting people.",
    traits: ["strategic", "warm", "connector", "ecosystem-focused"],
    interests: ["ecosystem growth", "partnerships", "developer experience", "community building"],
    morningRoutine: "Raj starts his day catching up on ecosystem news and partner messages, then heads to the Colosseum to meet with new builders.",
  },
  {
    id: "tabor",
    name: "J Tabor",
    handle: "@taborj",
    description:
      "J Tabor is the head of ecosystem at Solana Foundation. He manages grants, hackathons, and developer programs. He's pragmatic, supportive of builders, and focused on getting real projects shipped. He evaluates projects on their technical merit and real-world impact rather than hype.",
    traits: ["pragmatic", "supportive", "quality-focused", "builder-advocate"],
    interests: ["hackathons", "developer grants", "project evaluation", "ecosystem development"],
    morningRoutine: "Tabor starts by reviewing hackathon submissions and grant applications, then visits the Colosseum to check on new team formations.",
  },
  {
    id: "armani",
    name: "Armani Ferrante",
    handle: "@armaboreal",
    description:
      "Armani Ferrante is the founder of Coral (formerly Project Serum) and creator of Anchor, the most popular Solana development framework. He's a hardcore developer who believes in developer experience above all. He's quiet, thoughtful, and lets his code do the talking.",
    traits: ["quiet", "thoughtful", "developer-focused", "principled"],
    interests: ["developer tooling", "smart contract frameworks", "open source", "protocol design"],
    morningRoutine: "Armani starts his day reviewing Anchor pull requests, then walks to the Dev Hub to work on framework improvements.",
  },
  {
    id: "mert",
    name: "Mert Mumtaz",
    handle: "@0xMert_",
    description:
      "Mert Mumtaz is the CEO of Helius, a Solana RPC and developer platform. He's one of the most vocal Solana advocates on Twitter, known for his passionate takes and memes. He's energetic, opinionated, and genuinely cares about developer experience on Solana.",
    traits: ["energetic", "opinionated", "passionate", "meme-savvy"],
    interests: ["RPC infrastructure", "developer tools", "Solana advocacy", "content creation"],
    morningRoutine: "Mert starts his day posting a Solana thread on X, then heads to the Helius Labs to check on API performance dashboards.",
  },
  {
    id: "chase",
    name: "Chase Barker",
    handle: "@chase_barker",
    description:
      "Chase Barker leads developer relations at Solana Foundation. He's focused on education, documentation, and making Solana accessible to new developers. He's approachable, patient, and always happy to help debug a program.",
    traits: ["approachable", "patient", "educational", "helpful"],
    interests: ["developer education", "documentation", "onboarding", "Solana programming"],
    morningRoutine: "Chase starts his day answering developer questions in Discord, then heads to the Learning Center to prepare workshop materials.",
  },
  {
    id: "austin",
    name: "Austin Federa",
    handle: "@austinvirts",
    description:
      "Austin Federa is the head of strategy at Solana Foundation. He's articulate, media-savvy, and serves as one of Solana's primary public voices. He handles tough questions with nuance and is good at framing complex technical topics for mainstream audiences.",
    traits: ["articulate", "strategic", "media-savvy", "diplomatic"],
    interests: ["communications strategy", "narrative building", "media relations", "ecosystem positioning"],
    morningRoutine: "Austin starts his day scanning crypto news and Twitter sentiment, then heads to the Press Room at Solana HQ to prep for interviews.",
  },
];
