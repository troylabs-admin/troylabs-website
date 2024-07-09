import React, { useState, useEffect, useRef } from "react";
import { motion, useAnimation } from "framer-motion";
import { FaChevronCircleDown, FaChevronDown } from "react-icons/fa";

const AnimatedSVG = () => {
  const [activeNode, setActiveNode] = useState(null);
  const baseSpeed = 85;

  const nodeConfigs = [
    {
      cx: 253.5,
      cy: 984,
      size: 80,
      speed: 1.2,
      color: "#FFFFFF",
      hasOrbit: true,
      orbitSpeed: 8,
      info: "BUILD Accelerator",
    },
    {
      cx: 1304.5,
      cy: 402.5,
      size: 90,
      speed: 0.8,
      color: "#FFFFFF",
      hasOrbit: false,
      info: "IGNITE Community",
    },
    {
      cx: 1228,
      cy: 1049,
      size: 85,
      speed: 1,
      color: "#FFFFFF",
      hasOrbit: true,
      orbitSpeed: 5,
      info: "DEMO Exhibition",
    },
    {
      cx: 1404.5,
      cy: 836.5,
      size: 30,
      speed: 1.5,
      color: "#FFFFFF",
      hasOrbit: false,
      info: "Startup Workshops",
    },
    {
      cx: 112.5,
      cy: 363.5,
      size: 30,
      speed: 1.3,
      color: "#FFFFFF",
      hasOrbit: true,
      orbitSpeed: 3,
      info: "Mentorship Programs",
    },
    {
      cx: 135.115,
      cy: 562.052,
      size: 60,
      speed: 0.9,
      color: "#FFFFFF",
      hasOrbit: false,
      info: "Networking Events",
    },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveNode((prevNode) => (prevNode + 1) % nodeConfigs.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const OrbitalNode = ({
    cx,
    cy,
    size,
    color,
    hasOrbit,
    orbitSpeed,
    info,
    index,
  }) => (
    <motion.g
      whileHover={{ scale: 1.1 }}
      onClick={() => setActiveNode(index)}
      style={{ cursor: "pointer" }}
      className={"relative z-50"}
    >
      {hasOrbit && (
        <circle
          cx={cx}
          cy={cy}
          r={size / 2}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeOpacity="0.3"
        />
      )}
      <motion.circle
        cx={cx}
        cy={cy}
        r={size / 4}
        fill={color}
        fillOpacity="0.8"
        animate={
          index === activeNode
            ? {
                scale: [1, 1.2, 1],
                opacity: [0.8, 1, 0.8],
              }
            : {}
        }
        transition={{
          duration: 2,
          repeat: Infinity,
          repeatType: "reverse",
        }}
      />
      {index === activeNode && (
        <motion.circle
          cx={cx}
          cy={cy}
          r={size / 3}
          stroke={color}
          strokeWidth="2"
          strokeOpacity="0.5"
          fill="none"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1.2, opacity: 1 }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            repeatType: "reverse",
          }}
        />
      )}
    </motion.g>
  );

  return (
    <svg
      width="100%"
      height="1416"
      viewBox="0 0 1516 1516"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="757.5"
        cy="757.5"
        r="651.5"
        stroke="url(#paint0_linear_345_432)"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <circle
        cx="758"
        cy="755"
        r="554"
        stroke="url(#paint1_linear_345_432)"
        strokeOpacity="0.25"
        strokeWidth="2"
        strokeDasharray="8 8"
      />
      <circle
        cx="758"
        cy="758"
        r="757"
        stroke="url(#paint2_linear_345_432)"
        strokeOpacity="0.25"
        strokeWidth="2"
        strokeDasharray="9.29 9.29"
      />

      {nodeConfigs.map((config, index) => (
        <motion.g
          key={index}
          animate={{
            rotate: 360,
          }}
          transition={{
            duration: baseSpeed / config.speed,
            repeat: Infinity,
            ease: "linear",
          }}
          style={{ originX: "758px", originY: "758px" }}
        >
          <OrbitalNode {...config} index={index} />
        </motion.g>
      ))}

      <defs>
        <filter
          id="filter0_b_345_432"
          x="21"
          y="752"
          width="465"
          height="464"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
        >
          <feFlood flood-opacity="0" result="BackgroundImageFix" />
          <feGaussianBlur in="BackgroundImageFix" stdDeviation="100" />
          <feComposite
            in2="SourceAlpha"
            operator="in"
            result="effect1_backgroundBlur_345_432"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_backgroundBlur_345_432"
            result="shape"
          />
        </filter>
        <filter
          id="filter1_b_345_432"
          x="1068"
          y="167"
          width="473"
          height="471"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
        >
          <feFlood flood-opacity="0" result="BackgroundImageFix" />
          <feGaussianBlur in="BackgroundImageFix" stdDeviation="100" />
          <feComposite
            in2="SourceAlpha"
            operator="in"
            result="effect1_backgroundBlur_345_432"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_backgroundBlur_345_432"
            result="shape"
          />
        </filter>
        <filter
          id="filter2_b_345_432"
          x="992"
          y="813"
          width="472"
          height="472"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
        >
          <feFlood flood-opacity="0" result="BackgroundImageFix" />
          <feGaussianBlur in="BackgroundImageFix" stdDeviation="100" />
          <feComposite
            in2="SourceAlpha"
            operator="in"
            result="effect1_backgroundBlur_345_432"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_backgroundBlur_345_432"
            result="shape"
          />
        </filter>
        <filter
          id="filter3_b_345_432"
          x="1195"
          y="627"
          width="419"
          height="419"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
        >
          <feFlood flood-opacity="0" result="BackgroundImageFix" />
          <feGaussianBlur in="BackgroundImageFix" stdDeviation="100" />
          <feComposite
            in2="SourceAlpha"
            operator="in"
            result="effect1_backgroundBlur_345_432"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_backgroundBlur_345_432"
            result="shape"
          />
        </filter>
        <filter
          id="filter4_b_345_432"
          x="-97"
          y="154"
          width="419"
          height="419"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
        >
          <feFlood flood-opacity="0" result="BackgroundImageFix" />
          <feGaussianBlur in="BackgroundImageFix" stdDeviation="100" />
          <feComposite
            in2="SourceAlpha"
            operator="in"
            result="effect1_backgroundBlur_345_432"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_backgroundBlur_345_432"
            result="shape"
          />
        </filter>
        <filter
          id="filter5_b_345_432"
          x="-86.9375"
          y="340"
          width="444.104"
          height="444.104"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
        >
          <feFlood flood-opacity="0" result="BackgroundImageFix" />
          <feGaussianBlur in="BackgroundImageFix" stdDeviation="100" />
          <feComposite
            in2="SourceAlpha"
            operator="in"
            result="effect1_backgroundBlur_345_432"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_backgroundBlur_345_432"
            result="shape"
          />
        </filter>
        <linearGradient
          id="paint0_linear_345_432"
          x1="757.5"
          y1="105"
          x2="757.5"
          y2="1410"
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color="white" stop-opacity="0" />
          <stop offset="0.473958" stop-color="white" />
        </linearGradient>
        <linearGradient
          id="paint1_linear_345_432"
          x1="758"
          y1="200"
          x2="758"
          y2="1310"
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color="white" stop-opacity="0" />
          <stop offset="0.473958" stop-color="white" />
        </linearGradient>
        <linearGradient
          id="paint2_linear_345_432"
          x1="758"
          y1="0"
          x2="758"
          y2="1516"
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color="white" stop-opacity="0" />
          <stop offset="0.473958" stop-color="white" />
        </linearGradient>
      </defs>
    </svg>
  );
};

const HeroSection = () => {
  return (
    <div className="relative w-full h-[85vh] bg-gradient-to-br from-[#F19E18] via-[#F08821] to-[#E62314] overflow-hidden">
      <div className="absolute inset-0 pointer-events-auto">
        <AnimatedSVG />
        <div className="w-full absolute h-4 bg-white rounded-t-3xl bottom-0" />
      </div>
      <div className="relative z-10 h-full flex flex-col justify-center items-center text-white px-4 max-w-7xl mx-auto py-20">
        <div className="space-y-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h3 className="text-xl md:text-2xl font-normal tracking-wide uppercase mb-2">
              Partner With Us
            </h3>
          </motion.div>

          <motion.h1
            className="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-relaxed max-w-2xl"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            Support the Future of Innovation
          </motion.h1>

          <motion.p
            className="text-lg md:text-xl font-light max-w-2xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            Join TroyLabs in empowering the next generation of entrepreneurs.
            Your partnership can ignite groundbreaking ideas and shape
            tomorrow's business landscape.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
          >
            <a
              href="mailto:troylabs@usc.edu"
              className="inline-block mt-12 bg-white text-[#E62314] px-8 py-3 rounded-full font-semibold text-lg hover:bg-opacity-90 transition duration-300"
            >
              Become a Partner
            </a>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default HeroSection;
