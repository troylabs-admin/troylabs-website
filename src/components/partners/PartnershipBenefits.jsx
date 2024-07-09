import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaUsers,
  FaRocket,
  FaGraduationCap,
  FaHandshake,
} from "react-icons/fa";

const PartnersBenefits = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const benefits = [
    {
      icon: FaUsers,
      title: "Talent Pipeline",
      description: "Access USC's exceptional pool of entrepreneurial talent",
    },
    {
      icon: FaRocket,
      title: "Innovation Hub",
      description: "Engage with groundbreaking startups and innovative ideas",
    },
    {
      icon: FaGraduationCap,
      title: "Educational Impact",
      description:
        "Contribute to shaping the future of entrepreneurship education",
    },
    {
      icon: FaHandshake,
      title: "Ecosystem Access",
      description: "Integrate into USC's dynamic entrepreneurial network",
    },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prevIndex) => (prevIndex + 1) % benefits.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const diamondPositions = [
    { x: 478 + 25, y: 517 - 300, size: 408 }, // Central large diamond
    { x: 245 + 25, y: 550 - 300, size: 207 }, // Bottom left diamond
    { x: 760 + 25, y: 782 - 300, size: 319 }, // Right diamond
    { x: 785 + 25, y: 425 - 300, size: 212 }, // Additional diamond
  ];

  const DiamondContent = ({ benefit, index, isActive, position }) => (
    <motion.g
      initial={false}
      animate={{
        scale: isActive ? 1.05 : 1,
      }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      onHoverStart={() => setActiveIndex(index)}
    >
      <motion.rect
        x={position.x}
        y={position.y}
        width={position.size}
        height={position.size}
        rx="9.5"
        transform={`rotate(45 ${position.x + position.size / 2} ${
          position.y + position.size / 2
        })`}
        fill={isActive ? "#ffffff" : "rgba(255, 255, 255, 0.1)"}
        stroke={isActive ? "#E93E15" : "#BDBDBD"}
        strokeWidth={isActive ? 2 : 1}
        initial={false}
        animate={{
          filter: isActive
            ? "drop-shadow(0 0 5px rgba(233, 62, 21, 0.5))"
            : "none",
        }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
      />
      <g
        transform={`translate(${position.x + position.size / 2}, ${
          position.y + position.size / 2
        })`}
      >
        <text
          textAnchor="middle"
          fill="#333"
          fontSize={position.size * 0.08}
          fontWeight="bold"
          y={position.size * 0.05}
        >
          {benefit.title}
        </text>
        <text
          y={position.size * 0.1}
          textAnchor="middle"
          fill="#666"
          fontSize={position.size * 0.05}
        >
          <tspan x="0" dy={position.size * 0.05}>
            {benefit.description.split(" ").slice(0, 4).join(" ")}
          </tspan>
          <tspan x="0" dy={position.size * 0.05}>
            {benefit.description.split(" ").slice(4).join(" ")}
          </tspan>
        </text>
        {React.createElement(benefit.icon, {
          x: -position.size * 0.1,
          y: -position.size * 0.25,
          size: position.size * 0.2,
          fill: "#E93E15",
        })}
      </g>
    </motion.g>
  );

  return (
    <div className="hidden md:flex w-full min-h-screen flex-col items-center justify-start pt-16 px-4">
      <h1 className="text-4xl font-bold mt-6 text-gray-900 mb-4">
        Partner with TroyLabs
      </h1>
      <p className="text-xl text-gray-600">
        Elevate your impact through USC's entrepreneurial ecosystem
      </p>

      <div className="relative w-full aspect-[1467/1147]">
        <motion.svg
          className="absolute top-0 left-0 w-full h-[100%]"
          viewBox="0 0 1467 1147"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1 }}
        >
          <AnimatePresence>
            {[...benefits].sort((a, b) => 
              benefits.indexOf(a) === activeIndex ? 1 : benefits.indexOf(b) === activeIndex ? -1 : 0
            ).map((benefit, index) => (
              <DiamondContent
                key={benefits.indexOf(benefit)}
                benefit={benefit}
                index={benefits.indexOf(benefit)}
                isActive={activeIndex === benefits.indexOf(benefit)}
                position={diamondPositions[benefits.indexOf(benefit)]}
              />
            ))}
          </AnimatePresence>

          <defs>
            <filter
              id="filter0_d_1787_227"
              x="81.1406"
              y="0.142578"
              width="1053.72"
              height="1053.71"
              filterUnits="userSpaceOnUse"
              color-interpolation-filters="sRGB"
            >
              <feFlood flood-opacity="0" result="BackgroundImageFix" />
              <feColorMatrix
                in="SourceAlpha"
                type="matrix"
                values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                result="hardAlpha"
              />
              <feMorphology
                radius="2"
                operator="dilate"
                in="SourceAlpha"
                result="effect1_dropShadow_1787_227"
              />
              <feOffset dx="10" dy="10" />
              <feGaussianBlur stdDeviation="60" />
              <feComposite in2="hardAlpha" operator="out" />
              <feColorMatrix
                type="matrix"
                values="0 0 0 0 0.913725 0 0 0 0 0.243137 0 0 0 0 0.0823529 0 0 0 1 0"
              />
              <feBlend
                mode="normal"
                in2="BackgroundImageFix"
                result="effect1_dropShadow_1787_227"
              />
              <feBlend
                mode="normal"
                in="SourceGraphic"
                in2="effect1_dropShadow_1787_227"
                result="shape"
              />
            </filter>
            <filter
              id="filter1_d_1787_227"
              x="0.140625"
              y="451.143"
              width="651.719"
              height="651.715"
              filterUnits="userSpaceOnUse"
              color-interpolation-filters="sRGB"
            >
              <feFlood flood-opacity="0" result="BackgroundImageFix" />
              <feColorMatrix
                in="SourceAlpha"
                type="matrix"
                values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                result="hardAlpha"
              />
              <feMorphology
                radius="2"
                operator="dilate"
                in="SourceAlpha"
                result="effect1_dropShadow_1787_227"
              />
              <feOffset dx="10" dy="10" />
              <feGaussianBlur stdDeviation="60" />
              <feComposite in2="hardAlpha" operator="out" />
              <feColorMatrix
                type="matrix"
                values="0 0 0 0 0.913725 0 0 0 0 0.243137 0 0 0 0 0.0823529 0 0 0 1 0"
              />
              <feBlend
                mode="normal"
                in2="BackgroundImageFix"
                result="effect1_dropShadow_1787_227"
              />
              <feBlend
                mode="normal"
                in="SourceGraphic"
                in2="effect1_dropShadow_1787_227"
                result="shape"
              />
            </filter>
            <filter
              id="filter2_d_1787_227"
              x="543.229"
              y="223.231"
              width="922.941"
              height="922.937"
              filterUnits="userSpaceOnUse"
              color-interpolation-filters="sRGB"
            >
              <feFlood flood-opacity="0" result="BackgroundImageFix" />
              <feColorMatrix
                in="SourceAlpha"
                type="matrix"
                values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                result="hardAlpha"
              />
              <feMorphology
                radius="2.4"
                operator="dilate"
                in="SourceAlpha"
                result="effect1_dropShadow_1787_227"
              />
              <feOffset dx="12" dy="12" />
              <feGaussianBlur stdDeviation="72.0001" />
              <feComposite in2="hardAlpha" operator="out" />
              <feColorMatrix
                type="matrix"
                values="0 0 0 0 0.913725 0 0 0 0 0.243137 0 0 0 0 0.0823529 0 0 0 1 0"
              />
              <feBlend
                mode="normal"
                in2="BackgroundImageFix"
                result="effect1_dropShadow_1787_227"
              />
              <feBlend
                mode="normal"
                in="SourceGraphic"
                in2="effect1_dropShadow_1787_227"
                result="shape"
              />
            </filter>
          </defs>
        </motion.svg>
      </div>
    </div>
  );
};

export default PartnersBenefits;
