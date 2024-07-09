import React from "react";
import { motion } from "framer-motion";
import Boat from "../../assets/RetreatCar.jpg";
import DEMOTLGroupPhoto from "../../assets/LaunchWinners2024.JPG";
import DEMOKeynote from "../../assets/RetreatUno.jpg";
import DEMOSpeakers from "../../assets/LaunchGroup.JPG";

const ValueCard = ({ number, title, description, index }) => {
  return (
    <motion.div
      className="mb-12"
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.2 }}
    >
      <div className="flex items-start">
        <span className="text-4xl font-light text-gray-300 mr-4">
          {number.toString().padStart(2, "0")}
        </span>
        <div>
          <h3 className="text-2xl font-bold text-gray-800 mb-2">{title}</h3>
          <p className="text-gray-600 font-light max-w-md">{description}</p>
        </div>
      </div>
    </motion.div>
  );
};

const AnimatedImage = () => {
  return (
    <div className="relative w-[633px] h-[836px]">
      <svg
        width="633"
        height="836"
        viewBox="0 0 633 836"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M792.508 316.5C792.508 490.735 649.584 632 473.254 632C296.924 632 154.001 490.735 154.001 316.5C154.001 142.265 296.924 1 473.254 1C649.584 1 792.508 142.265 792.508 316.5Z"
          stroke="#F2F2F2"
          strokeWidth="2"
        />
        <path
          d="M668.508 363.5C668.508 537.735 525.584 679 349.254 679C172.924 679 30.001 537.735 30.001 363.5C30.001 189.265 172.924 48 349.254 48C525.584 48 668.508 189.265 668.508 363.5Z"
          stroke="#F2F2F2"
          strokeWidth="2"
        />
      </svg>
      <motion.div
        className="absolute"
        style={{
          top: "114px",
          left: "354px",
          width: "498px",
          height: "298px",
          transform: "rotate(10.0832deg)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      >
        <img
          src={DEMOTLGroupPhoto}
          alt="Group Photo"
          className="w-full h-full object-cover rounded-2xl hover:scale-105 transition-all duration-700"
        />
      </motion.div>
      <motion.div
        className="absolute"
        style={{
          top: "66px",
          left: "52px",
          width: "282px",
          height: "298px",
          transform: "rotate(10.0832deg)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.2 }}
      >
        <img
          src={Boat}
          alt="Boat"
          className="w-full h-full object-cover rounded-2xl hover:scale-105 transition-all duration-700"
        />
      </motion.div>
      <motion.div
        className="absolute"
        style={{
          top: "393px",
          left: "64px",
          width: "327px",
          height: "298px",
          transform: "rotate(10.0832deg)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.4 }}
      >
        <img
          src={DEMOKeynote}
          alt="Keynote"
          className="w-full h-full object-cover rounded-2xl hover:scale-105 transition-all duration-700"
        />
      </motion.div>
      <motion.div
        className="absolute"
        style={{
          top: "454px",
          left: "415px",
          width: "498px",
          height: "298px",
          transform: "rotate(10.0832deg)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.6 }}
      >
        <img
          src={DEMOSpeakers}
          alt="Speakers"
          className="w-full h-full object-cover rounded-2xl hover:scale-105 transition-all duration-700"
        />
      </motion.div>
    </div>
  );
};

const ValuesSection = () => {
  const values = [
    {
      title: "Commitment to Growth",
      description:
        "We prioritize personal and professional development, believing continuous learning is essential for innovation and success.",
    },
    {
      title: "Community Building",
      description:
        "We value the strength of a supportive and collaborative community, recognizing that diverse perspectives lead to exceptional outcomes.",
    },
    {
      title: "Adaptive Innovation",
      description:
        "We embrace change and adaptability, understanding that staying open to new ideas is crucial in the entrepreneurial landscape.",
    },
    {
      title: "Passion-Driven Endeavors",
      description:
        "We encourage the pursuit of passions, knowing that enthusiasm and dedication are key to transforming ideas into impactful ventures.",
    },
  ];

  return (
    <div className="w-full min-h-screen overflow-x-hidden py-16">
      <div className="container mx-auto px-4">
        <div className="flex flex-col lg:flex-row justify-between items-start mb-16">
          <div className="lg:w-1/2 mb-8 lg:mb-0">
            <h3 className="text-xl text-gray-400 font-medium mb-4 uppercase tracking-wider">
              Our Values
            </h3>
            <h1 className="text-4xl sm:text-5xl max-w-lg leading-tight sm:leading-snug text-gray-800 font-bold mb-6 text-left">
              Community and people first
            </h1>
            <p className="text-gray-500 max-w-md text-left mb-16">
              At TroyLabs, our values are the cornerstone of our culture,
              guiding our decisions and shaping our impact on the
              entrepreneurial ecosystem.
            </p>
            <div>
              {values.map((value, index) => (
                <ValueCard
                  key={index}
                  number={index + 1}
                  title={value.title}
                  description={value.description}
                  index={index}
                />
              ))}
            </div>
          </div>
          <div className="lg:w-1/2 mt-12 lg:mt-0">
            <AnimatedImage />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ValuesSection;
