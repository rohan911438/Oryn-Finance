"use client";
import { useEffect } from "react";

const SmoothScroll = () => {
    useEffect(() => {
        (async () => {
            try {
                const LocomotiveScroll = (await import('locomotive-scroll')).default;
                const scroll = new LocomotiveScroll();
            } catch (error) {
                console.error("LocomotiveScroll failed to initialize:", error);
            }
        })();
    }, []);

    return null;
};

export default SmoothScroll;
