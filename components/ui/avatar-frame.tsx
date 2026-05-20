'use client';

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// -------------------------------------------------------------
// PREMIUM ANIMATED CSS FRAMES (DISCORD STYLE)
// -------------------------------------------------------------

export const FireFrame = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <div className={cn("relative w-full h-full rounded-full flex items-center justify-center p-1.5", className)}>
        <div className="absolute inset-0 rounded-full bg-gradient-to-t from-red-600 via-orange-500 to-yellow-400 animate-[spin_3s_linear_infinite] blur-[6px] opacity-80" />
        <div className="absolute inset-0 rounded-full bg-gradient-to-t from-red-600 via-orange-500 to-yellow-400 animate-[spin_4s_linear_infinite_reverse]" />
        <div className="relative z-10 w-full h-full rounded-full overflow-hidden bg-black border-2 border-orange-900/50 flex items-center justify-center">
            {children}
        </div>
        <div className="absolute -top-1 right-0 w-2 h-2 sm:w-3 sm:h-3 bg-yellow-400 rounded-full animate-ping" />
        <div className="absolute -bottom-1 left-1 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-orange-500 rounded-full animate-ping" style={{ animationDelay: '0.5s' }} />
    </div>
);

export const SpaceFrame = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <div className={cn("relative w-full h-full rounded-full flex items-center justify-center p-2", className)}>
        <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent,rgba(168,85,247,0.8),transparent)] animate-[spin_4s_linear_infinite]" />
        <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_180deg,transparent,rgba(59,130,246,0.8),transparent)] animate-[spin_4s_linear_infinite]" />
        <div className="absolute inset-0 rounded-full border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.5)]" />
        <div className="relative z-10 w-full h-full rounded-full overflow-hidden bg-slate-950 border-2 border-indigo-500/50 flex items-center justify-center">
            {children}
        </div>
        <Sparkles className="absolute -top-2 -right-1 sm:-top-3 sm:-right-2 w-4 h-4 sm:w-5 sm:h-5 text-purple-300 animate-pulse drop-shadow-[0_0_5px_#fff]" />
        <Sparkles className="absolute bottom-0 -left-1 sm:-left-2 w-3 h-3 sm:w-4 sm:h-4 text-blue-300 animate-pulse drop-shadow-[0_0_5px_#fff]" style={{ animationDelay: '1s' }} />
    </div>
);

export const CyberpunkFrame = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <div className={cn("relative w-full h-full rounded-full flex items-center justify-center p-1.5", className)}>
        <div className="absolute inset-0 rounded-full border-[3px] border-transparent" 
             style={{ background: 'linear-gradient(black,black) padding-box, linear-gradient(45deg, #0ff, #f0f) border-box' }} />
        <div className="absolute inset-0 rounded-full border-[2px] sm:border-[3px] border-cyan-400 border-dashed animate-[spin_10s_linear_infinite] opacity-50" />
        <div className="relative z-10 w-full h-full rounded-full overflow-hidden bg-zinc-950 flex items-center justify-center">
            {children}
            <div className="absolute inset-0 bg-cyan-400/10 animate-pulse" />
        </div>
    </div>
);

export const GlitchFrame = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <div className={cn("relative w-full h-full rounded-full flex items-center justify-center p-1.5", className)}>
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-green-500 via-transparent to-red-500 animate-pulse mix-blend-screen opacity-70" style={{ animationDuration: '0.2s' }} />
        <div className="absolute inset-0 rounded-full border-[2px] sm:border-[3px] border-green-500 border-dotted animate-[spin_2s_linear_infinite_reverse]" />
        <div className="relative z-10 w-full h-full rounded-full overflow-hidden bg-black flex items-center justify-center">
            {children}
            <div className="absolute inset-0 bg-white/5 opacity-0 hover:opacity-100 transition-opacity mix-blend-overlay" />
        </div>
        {/* Glitch slices */}
        <div className="absolute top-1/4 -left-2 w-4 h-1 bg-green-400 animate-ping" style={{ animationDuration: '0.1s' }} />
        <div className="absolute bottom-1/3 -right-1 w-3 h-1 bg-red-500 animate-ping" style={{ animationDuration: '0.3s' }} />
    </div>
);

export const ToxicFrame = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <div className={cn("relative w-full h-full rounded-full flex items-center justify-center p-2", className)}>
        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-lime-400 to-green-600 animate-pulse blur-[8px] opacity-60" />
        <div className="absolute inset-0 mt-2 rounded-full border-[4px] border-lime-500/80 animate-[spin_5s_linear_infinite]" style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }} />
        <div className="relative z-10 w-full h-full rounded-full overflow-hidden bg-[#0a1a0a] border-2 border-lime-900 flex items-center justify-center">
            {children}
        </div>
        {/* Bubbles */}
        <div className="absolute -top-3 left-1/3 w-3 h-3 bg-lime-400 rounded-full animate-bounce" />
        <div className="absolute top-0 right-1/4 w-2 h-2 bg-lime-300 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
    </div>
);

export const CrownFrame = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <div className={cn("relative w-full h-full rounded-full flex items-center justify-center p-1.5 pt-2.5 sm:pt-3", className)}>
        <div className="absolute inset-0 mt-1 sm:mt-2 rounded-full border-[3px] sm:border-[4px] border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.6)]" />
        <div className="absolute inset-0 mt-1 sm:mt-2 rounded-full border-[3px] sm:border-[4px] border-yellow-300 animate-pulse opacity-50" />
        <div className="relative z-10 w-full h-full rounded-full overflow-hidden bg-black border border-yellow-900/50 flex items-center justify-center">
            {children}
        </div>
        <div className="absolute -top-3 sm:-top-4 left-1/2 -translate-x-1/2 z-20 drop-shadow-[0_2px_10px_rgba(234,179,8,0.8)]">
            <svg viewBox="0 0 24 24" fill="#EAB308" stroke="#A16207" strokeWidth="1.5" className="w-6 h-4 sm:w-10 sm:h-7">
                <path d="M2 20h20v2H2z" />
                <path d="M22 18H2l2-11 4 4 4-8 4 8 4-4z" />
            </svg>
        </div>
    </div>
);

export const DiamondBadge = ({ className }: { className?: string }) => (
    <div className={cn("relative w-full h-full flex items-center justify-center", className)}>
        <div className="absolute inset-0 bg-cyan-400/20 blur-xl rounded-full animate-pulse" />
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]">
            <path d="M12 2L2 8L12 22L22 8L12 2Z" fill="#22D3EE" fillOpacity="0.8" stroke="#0891B2" strokeWidth="1"/>
            <path d="M2 8H22M12 2V22M12 2L7 8M12 2L17 8" stroke="#CFFAFE" strokeWidth="0.5"/>
        </svg>
    </div>
);

export const RubyBadge = ({ className }: { className?: string }) => (
    <div className={cn("relative w-full h-full flex items-center justify-center", className)}>
        <div className="absolute inset-0 bg-red-500/20 blur-xl rounded-full animate-pulse" />
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#EF4444" fillOpacity="0.9" stroke="#991B1B" strokeWidth="1"/>
            <path d="M7.5 4C5.1 4 3 6 3 8.5C3 11.5 6 14.5 11 19L12 20L13 19C18 14.5 21 11.5 21 8.5C21 6 18.9 4 16.5 4C14.5 4 12.8 5.2 12 7L12 8L12 7C11.2 5.2 9.5 4 7.5 4Z" stroke="#FCA5A5" strokeWidth="0.5"/>
        </svg>
    </div>
);

export const DefaultFrame = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <div className={cn("w-full h-full rounded-full overflow-hidden bg-muted flex items-center justify-center", className)}>
        {children}
    </div>
);

interface UserAvatarFrameProps {
    frameId: string | null;
    children: React.ReactNode;
    className?: string;
    customColor?: string | null;
}

export function UserAvatarFrame({ frameId, children, className, customColor }: UserAvatarFrameProps) {
    const renderFrame = () => {
        if (frameId === 'fire_effect') return <FireFrame className={className}>{children}</FireFrame>;
        if (frameId === 'space_effect') return <SpaceFrame className={className}>{children}</SpaceFrame>;
        if (frameId === 'cyberpunk_effect') return <CyberpunkFrame className={className}>{children}</CyberpunkFrame>;
        if (frameId === 'crown_effect') return <CrownFrame className={className}>{children}</CrownFrame>;
        if (frameId === 'glitch_effect') return <GlitchFrame className={className}>{children}</GlitchFrame>;
        if (frameId === 'toxic_effect') return <ToxicFrame className={className}>{children}</ToxicFrame>;
        
        return <DefaultFrame className={className}>{children}</DefaultFrame>;
    };

    if (customColor && customColor !== 'none' && customColor !== '0' && frameId && frameId !== 'default') {
        const filterStyle = { filter: `hue-rotate(${customColor}deg)` };
        return (
            <div style={filterStyle} className="w-full h-full flex items-center justify-center">
                {renderFrame()}
            </div>
        );
    }
    
    return renderFrame();
}
