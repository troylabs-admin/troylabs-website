import React from "react";
import { FaArrowRight } from "react-icons/fa";
import { motion } from "framer-motion";

import Boat from "../../assets/DemoGroupPhoto.jpg";
import DEMOTLGroupPhoto from "../../assets/RetreatGroup.jpg";
import DEMOKeynote from "../../assets/DEMOGroup.jpg";
import DEMOSpeakers from "../../assets/RetreatGroupPhoto.jpg";

const AnimatedStat = ({ icon, value, label }) => {
  const iconVariants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: {
      pathLength: 1,
      opacity: 1,
      transition: {
        duration: 4,
        ease: "easeInOut",
        repeat: Infinity,
        repeatType: "reverse",
        repeatDelay: 0.2,
      },
    },
  };

  return (
    <motion.div
      className="flex flex-col items-center justify-center"
      initial="hidden"
      animate="visible"
    >
      <svg viewBox="0 0 24 24" className="w-16 h-16 text-[#FF6B00]">
        <motion.path
          d={icon}
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          variants={iconVariants}
        />
      </svg>
      <motion.span
        className="text-5xl font-bold text-[#FF6B00] mt-4 mb-2"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        {value}
      </motion.span>
      <span className="text-sm text-gray-500 text-center">{label}</span>
    </motion.div>
  );
};

const AnimatedImage = () => {
  return (
    <div className="relative w-[595px] h-[695px]">
      <motion.div
        className="absolute w-[249px] h-[246px] rounded-full overflow-hidden"
        style={{
          left: "54px",
          top: "448px",
          backgroundImage: `url(${Boat})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        whileHover={{ scale: 1.05 }}
        transition={{ duration: 1 }}
      />
      <motion.div
        className="absolute w-[249px] h-[246px] rounded-full overflow-hidden"
        style={{
          left: "317px",
          top: "332px",
          backgroundImage: `url(${DEMOSpeakers})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        whileHover={{ scale: 1.05 }}
        transition={{ duration: 1, delay: 0.2 }}
      />
      <motion.div
        className="absolute w-[249px] h-[246px] rounded-full overflow-hidden"
        style={{
          left: "345px",
          top: "0",
          backgroundImage: `url(${DEMOKeynote})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        whileHover={{ scale: 1.05 }}
        transition={{ duration: 1, delay: 0.4 }}
      />
      <motion.div
        className="absolute w-[345px] h-[341px] rounded-full overflow-hidden"
        style={{
          left: "91px",
          top: "123px",
          backgroundImage: `url(${DEMOTLGroupPhoto})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        whileHover={{ scale: 1.05 }}
        transition={{ duration: 1, delay: 0.6 }}
      />
      <svg
        width="595"
        height="695"
        viewBox="0 0 595 695"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute top-0 left-0 pointer-events-none"
      >
        <path
          d="M461.385 293.78C461.385 401.626 372.919 489.074 263.762 489.074C154.605 489.074 66.1387 401.626 66.1387 293.78C66.1387 185.935 154.605 98.4864 263.762 98.4864C372.919 98.4864 461.385 185.935 461.385 293.78Z"
          stroke="#F2F2F2"
          strokeWidth="2.23833"
          fill="none"
        />
      </svg>
    </div>
  );
};

const WhoWeAre = () => {
  const stats = [
    {
      icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
      value: "45",
      label: "Members",
    },
    {
      icon: "M12 14l9-5-9-5-9 5 9 5z M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z",
      value: "15",
      label: "Majors",
    },
    {
      icon: "M13 10V3L4 14h7v7l9-11h-7z",
      value: "7",
      label: "Teams",
    },
  ];

  return (
    <div className="w-full min-h-screen overflow-x-hidden py-16 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="flex flex-col lg:flex-row justify-between items-start mb-16">
          <div className="lg:w-1/2 mb-8 lg:mb-0">
            <h3 className="text-xl text-gray-400 font-medium mb-4 uppercase tracking-wider">
              Who We Are
            </h3>
            <h1 className="text-4xl sm:text-5xl max-w-xl leading-tight sm:leading-snug text-gray-800 font-bold mb-6 text-left">
              Passionate students driving innovation
            </h1>
            <p className="text-gray-500 max-w-2xl text-left mb-16">
              We're a diverse group of problem-solvers, creators, and dreamers
              from various majors and backgrounds. United by our passion for
              entrepreneurship, we bring unique perspectives and skills to
              support and empower fellow student founders at USC.
            </p>
            <motion.button
              className="bg-[#191919] text-white px-8 py-3 rounded-full flex items-center"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Apply Now <FaArrowRight className="ml-2" />
            </motion.button>
            <div className="mt-16 w-full flex flex-row justify-start gap-12 ml-3 lg:ml-0 lg:gap-32">
              {stats.map((stat, index) => (
                <AnimatedStat
                  icon={stat.icon}
                  value={stat.value}
                  label={stat.label}
                  key={index}
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

export default WhoWeAre;
