import { cn } from "@/lib/utils";

export const AnimatedShinyText = ({
    children,
    className,
    shimmerWidth = 100,
}) => {
    return (
        <p
            style={{
                "--shimmer-width": `${shimmerWidth}px`,
            }}
            className={cn(
                "mx-auto max-w-md text-white/60",
                // Shimmer effect
                "animate-shimmer bg-clip-text bg-no-repeat [background-position:0_0] [background-size:var(--shimmer-width)_100%] [transition:background-position_1s_cubic-bezier(.6,.6,0,1)_infinite]",
                // Shimmer gradient
                "bg-gradient-to-r from-transparent via-white via-50% to-transparent",
                className,
            )}
        >
            {children}
        </p>
    );
};
