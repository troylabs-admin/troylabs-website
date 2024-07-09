import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, useAnimation } from "framer-motion";

const AnimatedLogo = ({ scrolled, scale = 1 }) => {
  const pathAnimation = useAnimation();
  const particlesRef = useRef([]);
  const svgRef = useRef(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const isMountedRef = useRef(false);

  const animateLogo = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    await pathAnimation.start({
      pathLength: 1,
      transition: { duration: 3, ease: "easeInOut" },
    });
    if (!isMountedRef.current) return;
    
    await pathAnimation.start({
      fill: scrolled ? "#F19E18" : "#FFFFFF",
      transition: { duration: 0.5, ease: "easeInOut" },
    });
  }, [pathAnimation, scrolled]);

  useEffect(() => {
    isMountedRef.current = true;
    setIsInitialized(true);

    animateLogo();

    const particleCount = 20;
    const path = svgRef.current?.querySelector("path");
    if (!path) return;

    const pathLength = path.getTotalLength();

    const createParticle = () => ({
      offset: Math.random(),
      speed: 0.5 + Math.random() * 1.5,
      size: 0.5 + Math.random() * 1.5,
      opacity: 1,
      angle: Math.random() * Math.PI * 2,
      life: 0,
      maxLife: 50 + Math.random() * 100,
    });

    particlesRef.current = Array.from(
      { length: particleCount },
      createParticle
    );

    let animationFrameId;

    const animateParticles = () => {
      if (!svgRef.current || !isMountedRef.current) return;

      particlesRef.current.forEach((particle, index) => {
        if (particle.life >= particle.maxLife) {
          particlesRef.current[index] = createParticle();
          return;
        }

        const point = path.getPointAtLength(particle.offset * pathLength);
        particle.x =
          point.x +
          Math.cos(particle.angle) * particle.life * particle.speed * 0.05;
        particle.y =
          point.y +
          Math.sin(particle.angle) * particle.life * particle.speed * 0.05;
        particle.life++;
        particle.opacity = 1 - particle.life / particle.maxLife;

        const particleElement = svgRef.current.querySelector(
          `#particle-${index}`
        );
        if (particleElement) {
          particleElement.setAttribute("cx", particle.x);
          particleElement.setAttribute("cy", particle.y);
          particleElement.setAttribute("r", particle.size);
          particleElement.setAttribute("opacity", particle.opacity);
        }
      });

      animationFrameId = requestAnimationFrame(animateParticles);
    };

    animateParticles();

    return () => {
      isMountedRef.current = false;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [animateLogo]);

  return (
    <motion.svg
      ref={svgRef}
      width={`${173 * scale}`}
      height={`${248 * scale}`}
      viewBox="-10 -10 173 248"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 1, ease: "easeOut" }}
      className={"overflow-visible"}
    >
      <motion.path
        d="M125.119 191.732C117.095 199.508 109.23 207.144 101.365 214.755C101.233 214.709 101.074 214.638 100.942 214.591V213.059C100.942 206.06 100.889 199.084 100.942 192.085C100.969 187.183 100.018 182.564 97.0095 178.346C95.3467 176.037 94.0534 173.515 92.4698 170.9C96.5344 170.498 100.361 170.074 104.162 169.721C106.327 169.509 108.148 168.778 108.94 166.917C110.391 163.523 111.685 160.082 113.136 156.43C111.553 156.736 110.154 156.995 108.755 157.302C101.259 158.903 93.7631 160.506 86.2672 162.109C84.3933 162.509 83.9182 163.004 84.0502 164.748C84.71 173.656 85.4226 182.564 86.1353 191.472C86.4521 195.431 85.5546 196.917 81.622 198.684C80.2232 199.32 78.7978 199.933 77.3462 200.475C76.9238 200.64 76.2904 200.64 75.8418 200.475C73.7039 199.673 71.6187 198.708 69.4545 197.953C66.8942 197.034 65.9969 195.29 66.1288 193.004C66.2608 190.624 66.3927 188.268 66.5775 185.887C67.1053 178.958 67.6333 172.055 68.1612 165.126C68.2931 163.216 67.7124 162.416 65.6273 161.992C57.0757 160.153 48.5242 158.386 39.9462 156.571C39.735 156.524 39.5239 156.524 38.9168 156.454C40.6852 160.412 42.2425 164.207 44.1164 167.883C44.5388 168.684 46.0959 169.273 47.2309 169.462C51.0844 170.05 54.9642 170.428 58.8441 170.876C59.0553 170.9 59.2665 170.922 59.636 170.97C59.4512 171.37 59.3456 171.7 59.1609 172.031C57.2341 175.235 55.2546 178.417 53.3807 181.645C51.6386 184.662 50.8468 187.914 50.8204 191.331C50.7413 198.613 50.5829 205.895 50.4509 213.154C50.4509 213.578 50.3717 213.978 50.2926 214.755C42.612 207.073 35.169 199.65 27.6203 192.085C18.6992 204.151 9.88371 216.052 1.09458 227.953C0.883433 227.883 0.698677 227.788 0.487527 227.717C0.461133 227.269 0.381951 226.798 0.381951 226.35C0.30277 210.089 0.619495 193.806 0.0388323 177.569C-0.436255 164.937 3.44363 153.932 11.9161 143.916C15.8751 139.25 19.2535 134.183 22.9223 129.305C24.1627 127.632 24.7434 125.841 24.717 123.814C24.5323 110.593 25.4824 97.4434 27.9635 84.3878C32.7144 59.5726 42.0313 36.3836 59.3456 16.2109C63.8061 11.0264 68.953 6.31313 73.8622 1.45849C75.8945 -0.544633 76.4752 -0.426803 78.6131 1.45849C99.3849 20.1229 113.031 42.3223 120.289 67.7501C124.38 82.1019 126.861 96.6422 127.204 111.442C127.31 115.377 127.441 119.29 127.521 123.225C127.573 125.016 128.048 126.641 129.183 128.15C134.224 134.772 139.16 141.441 144.201 148.063C150.615 156.524 153.176 165.903 152.991 176.013C152.78 188.574 152.78 201.159 152.621 213.719C152.568 217.937 152.357 222.155 152.225 226.374C152.225 226.798 152.12 227.199 151.987 228C142.909 215.698 134.067 203.75 125.145 191.661L125.119 191.732Z"
        fill={scrolled ? "#F19E18" : "rgba(255,255,255,0)"}
        stroke={scrolled ? "#F19E18" : "white"}
        strokeWidth="1"
        initial={{ pathLength: 0 }}
        animate={pathAnimation}
      />
      {isInitialized && particlesRef.current.map((_, index) => (
        <circle key={index} id={`particle-${index}`} fill={scrolled ? "#F19E18" : "white"} />
      ))}
    </motion.svg>
  );
};

export default AnimatedLogo;