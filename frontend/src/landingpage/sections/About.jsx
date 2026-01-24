import React, { useRef } from "react";
import Card from "../components/Card";
import { Globe } from "../components/Globe";
import CopyEmailButton from "../components/CopyEmailButton";
import { Frameworks } from "../components/Frameworks";
import { useScrollReveal } from "../hooks/useScrollReveal";

const About = () => {
  const grid2Container = useRef();
  const [sectionRef, isVisible] = useScrollReveal({ threshold: 0.1, once: true });

  return (
    <section id="about" className="c-space section-spacing">
      <h2 className="text-heading ">What is Oryn?</h2>
      <div
        ref={sectionRef}
        className={`grid grid-cols-1 gap-4 md:grid-cols-6 md:auto-rows-[18rem] mt-12 scroll-reveal ${isVisible ? 'visible' : ''}`}
      >
        {/* Grid 1 */}
        <div
          className="flex items-end 
        grid-default-color grid-1"
        >
          <img
            src="assets/coding-pov.png"
            className="absolute scale-[1.75] -right-[5rem] -top-[1rem] 
            md:scale-[3] md:left-50 md:inset-y-10 lg:scale-[2.5]"
          />
          <div className="z-10">
            <p className="headtext">Create a Market</p>
            <p className="subtext">
              Easily create prediction markets on any topic. Set your resolution criteria
              and initial liquidity to get started.
            </p>
          </div>
          <div
            className="absolute inset-x-0 pointer-events-none 
          -bottom-4 h-1/2 sm:h-1/3 bg-gradient-to-t from-indigo"
          />
        </div>
        {/* Grid 2 */}
        <div className="grid-default-color grid-2">
          <div
            ref={grid2Container}
            className="flex items-center justify-center w-full h-full"
          >
            <p className="flex items-end text-5xl text-gray-500">
              TRADE YES/NO
            </p>
            <Card
              style={{ rotate: "75deg", top: "30%", left: "20%" }}
              text="YES"
              containerRef={grid2Container}
            />
            <Card
              style={{ rotate: "-30deg", top: "60%", left: "45%" }}
              image="assets/logos/polygon-logo.png"
              containerRef={grid2Container}
            />
            <Card
              style={{ rotate: "90deg", bottom: "30%", left: "75%" }}
              image="assets/logos/celo-logo.png"
              containerRef={grid2Container}
            />
            <Card
              style={{ rotate: "-45deg", top: "55%", left: "0%" }}
              image="assets/logos/chainlink-logo.png"
              containerRef={grid2Container}
            />
            <Card
              style={{ rotate: "20deg", top: "10%", left: "38%" }}
              text="NO"
              containerRef={grid2Container}
            />
            <Card
              style={{ rotate: "30deg", top: "70%", left: "70%" }}
              image="assets/logos/stellar-logo.png"
              containerRef={grid2Container}
            />
            <Card
              style={{ rotate: "-45deg", top: "70%", left: "25%" }}
              image="assets/logos/ethereum-logo.png"
              containerRef={grid2Container}
            />
            <Card
              style={{ rotate: "-45deg", top: "5%", left: "10%" }}
              image="assets/logos/bitcoin-logo.png"
              containerRef={grid2Container}
            />
          </div>
        </div>
        {/* Grid 3 */}
        <div className="grid-black-color grid-3">
          <div className="z-10 w-[50%]">
            <p className="headtext">Oracle Resolves</p>
            <p className="subtext">
              Markets are resolved by trusted oracles, ensuring fair and transparent outcomes.
            </p>
          </div>
          <figure className="absolute left-[30%] top-[10%]">
            <Globe />
          </figure>
        </div>
        {/* Grid 4 */}
        <div className="grid-special-color grid-4">
          <div className="flex flex-col items-center justify-center gap-5 size-full">
            <p className="text-center headtext">
              Claim Winnings
            </p>
          </div>
        </div>
        {/* Grid 5 */}
        <div className="grid-default-color grid-5">
          <div className="z-10 w-[50%] relative">
            <p className="headtext">Tech Stack</p>
            <p className="subtext">
              I specialize in a variety of languages, frameworks, and tools that
              allow me to build robust and scalable applications
            </p>
          </div>

          <div
            className="absolute inset-y-0 md:inset-y-9 
            w-full h-full start-[50%] md:scale-125"
          >
            <Frameworks />
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;
