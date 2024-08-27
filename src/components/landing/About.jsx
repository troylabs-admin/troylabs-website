import React from "react";
import { motion } from "framer-motion";
import Initiatives from "./Initiatives";

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

function About() {
  const stats = [
    {
      icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
      value: "2016",
      label: "Founded",
    },
    {
      icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
      value: "$3M+",
      label: "Raised",
    },
    {
      icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
      value: "70+",
      label: "Companies",
    },
    {
      icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
      value: "45",
      label: "Members",
    },
  ];

  return (
    <div className="w-full bg-white flex flex-col items-center relative">
      <div className="w-full relative pb-[calc(100%+27rem)] sm:pb-[40rem] md:pb-[30rem] lg:pb-[20rem]">
        <Initiatives />
      </div>

      <section className="w-full flex flex-col items-center justify-center p-4 mt-36 sm:mt-16">
        <h3 className="text-xl text-gray-400 font-medium mb-4 uppercase tracking-wider">
          Who We Are
        </h3>
        <h1 className="text-4xl sm:text-5xl md:text-6xl max-w-3xl leading-tight sm:leading-snug text-gray-800 font-bold mb-6 text-center px-4">
          Building an ecosystem for USC startups to thrive
        </h1>
        <motion.p
          className="text-gray-600 max-w-3xl text-center mt-4 mb-16 px-4 text-md leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span className="font-bold text-[#F19E18]">TroyLabs</span> is a
          student-run organization at the University of Southern California,
          proudly sponsored by the{" "}
          <a
            href="https://www.marshall.usc.edu/departments/lloyd-greif-center-entrepreneurial-studies"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#E62314] hover:underline"
          >
            Lloyd Greif Center for Entrepreneurship
          </a>{" "}
          and{" "}
          <a
            href="https://www.marshall.usc.edu/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#E62314] hover:underline"
          >
            Marshall School of Business
          </a>
          . We're dedicated to fostering entrepreneurship and supporting
          early-stage startups at USC. Our mission is to encourage innovation,
          empower student founders, and promote entrepreneurial curiosity across
          campus, creating a vibrant ecosystem where USC startups can flourish
          and make a lasting impact.
        </motion.p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 sm:gap-16 w-full max-w-4xl px-4">
          {stats.map((stat, index) => (
            <AnimatedStat key={index} {...stat} />
          ))}
        </div>
      </section>
    </div>
  );
}

export default About;
