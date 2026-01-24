import { Canvas, useFrame } from "@react-three/fiber";
import HeroText from "../components/HeroText";
import ParrallaxBackground from "../components/ParrallaxBackground";
import { Astronaut } from "../components/Astronaut";
import { Float, Stars, PerspectiveCamera } from "@react-three/drei";
import { useMediaQuery } from "react-responsive";
import { Suspense, useRef } from "react";
import Loader from "../components/Loader";

const Hero = () => {
  const isMobile = useMediaQuery({ maxWidth: 853 });

  return (
    <section id="home" className="relative min-h-screen w-full flex items-center justify-start overflow-hidden bg-black">
      {/* Layered Background (Parallax) */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <ParrallaxBackground />
      </div>

      {/* Hero Text Content */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 md:px-12 lg:px-20 py-32">
        <HeroText />
      </div>

      {/* 3D Scene Layer */}
      <figure
        className="absolute inset-0 pointer-events-none z-5"
        style={{ width: "100vw", height: "100vh" }}
      >
        <Canvas dpr={[1, 2]}>
          <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={45} />
          <ambientLight intensity={2} />
          <pointLight position={[10, 10, 10]} intensity={3} />
          <spotLight position={[-10, 10, 10]} angle={0.15} penumbra={1} intensity={3} />

          <Suspense fallback={null}>
            <Float speed={3} rotationIntensity={1} floatIntensity={1.5}>
              <Astronaut
                scale={isMobile ? 0.65 : 1.3}
                position={isMobile ? [0, -0.8, 0.5] : [2.5, -0.5, 1.0]}
                rotation={[-Math.PI / 4, 0.2, 0.4]}
              />
            </Float>
            <Rig />
          </Suspense>
          <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />
        </Canvas>
      </figure>

      {/* Interactive Overlay Effects */}
      <div className="absolute inset-0 pointer-events-none z-20 bg-gradient-to-b from-transparent via-transparent to-[#030412]/50" />
    </section>
  );
};

function Rig() {
  return useFrame((state, delta) => {
    // Smooth camera motion following the mouse
    state.camera.position.x += (state.mouse.x * 0.5 - state.camera.position.x) * 0.05;
    state.camera.position.y += (state.mouse.y * 0.5 - state.camera.position.y) * 0.05;
  });
}

export default Hero;
