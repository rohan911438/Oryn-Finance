import { OrbitingCircles } from "./ObitingCircles";

export function Frameworks() {
  // Inner circle - Core Chains
  const innerSkills = [
    { name: "stellar-logo", ext: "png" },
    { name: "celo-logo", ext: "png" },
    { name: "polygon-logo", ext: "png" },
    { name: "solana-logo", ext: "png" },
  ];

  // Middle circle - DeFi & Major Chains
  const middleSkills = [
    { name: "ethereum-logo", ext: "png" },
    { name: "bitcoin-logo", ext: "png" },
    { name: "chainlink-logo", ext: "png" },
    { name: "uniswap-logo", ext: "png" },
    { name: "aave-logo", ext: "png" },
    { name: "nextjs", ext: "png" },
  ];

  // Outer circle - Development Tools
  const outerSkills = [
    { name: "react", ext: "svg" },
    { name: "typescript", ext: "svg" },
    { name: "tailwindcss", ext: "svg" },
    { name: "git", ext: "svg" },
    { name: "github", ext: "svg" },
    { name: "azure", ext: "svg" },
    { name: "threejs", ext: "svg" },
    { name: "javascript", ext: "svg" },
  ];

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden">
      {/* Inner Circle - Fastest orbit */}
      <OrbitingCircles
        className="h-[35px] w-[35px] border-none bg-transparent"
        duration={12}
        radius={50}
        path={false}
        iconSize={35}
      >
        {innerSkills.map((skill) => (
          <Icon key={skill.name} src={`assets/logos/${skill.name}.${skill.ext}`} />
        ))}
      </OrbitingCircles>

      {/* Middle Circle - Medium speed */}
      <OrbitingCircles
        className="h-[40px] w-[40px] border-none bg-transparent"
        duration={20}
        radius={90}
        reverse
        path={false}
        iconSize={40}
      >
        {middleSkills.map((skill) => (
          <Icon key={skill.name} src={`assets/logos/${skill.name}.${skill.ext}`} />
        ))}
      </OrbitingCircles>

      {/* Outer Circle - Slowest orbit */}
      <OrbitingCircles
        className="h-[45px] w-[45px] border-none bg-transparent"
        duration={30}
        radius={140}
        path={false}
        iconSize={45}
      >
        {outerSkills.map((skill) => (
          <Icon key={skill.name} src={`assets/logos/${skill.name}.${skill.ext}`} />
        ))}
      </OrbitingCircles>
    </div>
  );
}

const Icon = ({ src }) => (
  <div className="flex items-center justify-center p-2 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-300 shadow-lg">
    <img src={src} className="w-full h-full object-contain" alt="tech logo" />
  </div>
);
