import React from "react";
import Navbar from "landing-page/sections/Navbar.jsx";
import Hero from "landing-page/sections/Hero.jsx";
import About from "landing-page/sections/About.jsx";
import Projects from "landing-page/sections/Project.jsx";
import Experience from "landing-page/sections/Experience.jsx";
import Contact from "landing-page/sections/Contact.jsx";
import Footer from "landing-page/sections/Footer.jsx";

// Import the landing page specific styles
import "landing-page/index.css";

const LandingPage = () => {
    return (
        <div className="bg-[#030412] text-white min-h-screen lp-body-reset selection:bg-purple-500/30">
            <Navbar />
            <main className="relative min-h-screen">
                <Hero />
                <div className="max-w-screen-2xl mx-auto">
                    <About />
                </div>
                <div className="max-w-7xl mx-auto px-4 md:px-10">
                    <Projects />
                    <Experience />
                    <Contact />
                    <Footer />
                </div>
            </main>
        </div>
    );
};

export default LandingPage;
