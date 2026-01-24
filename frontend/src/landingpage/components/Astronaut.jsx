import { useGLTF } from "@react-three/drei";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

export function Astronaut({ scale = 1, position = [0, 0, 0], rotation = [0, 0, 0] }) {
  const { scene } = useGLTF("/models/tenhun_falling_spaceman_fanart.glb");
  const astronautRef = useRef();

  // Optional: Add subtle rotation animation
  useFrame((state) => {
    if (astronautRef.current) {
      astronautRef.current.rotation.y += 0.005;
    }
  });

  return (
    <primitive
      ref={astronautRef}
      object={scene}
      scale={scale}
      position={position}
      rotation={rotation}
    />
  );
}

// Preload the model for better performance
useGLTF.preload("/models/tenhun_falling_spaceman_fanart.glb");

