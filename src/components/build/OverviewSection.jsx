import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaRocket,
  FaUsers,
  FaChalkboardTeacher,
  FaLightbulb,
  FaTrophy,
  FaArrowRight,
} from "react-icons/fa";

const TROYLABS_ORANGE = "#F2994A";

const programData = [
  {
    id: 1,
    title: "MVP Submission",
    description:
      "Submit your Minimum Viable Product (MVP) and apply to be one of the 5-6 startups selected for BUILD.",
   
    icon: FaRocket,
    phase: "Pre-Accelerator",
  },
  {
    id: 2,
    title: "Team Formation",
    description:
      "Get matched with a dedicated team of 6 members from each of TroyLabs' different divisions.",
    icon: FaUsers,
    phase: "",
  },
  {
    id: 3,
    title: "Experienced Mentorship",
    description:
      "Receive guidance from industry experts and successful entrepreneurs to help you grow your business.",
    icon: FaChalkboardTeacher,
    phase: "",
  },
  {
    id: 4,
    title: "Product Development",
    description:
      "Refine your MVP and business strategy with hands-on support from our specialized teams.",
    icon: FaLightbulb,
    phase: "",
  },
  {
    id: 5,
    title: "LAUNCH Competition",
    description:
      "Pitch your startup to experienced judges and investors for a chance to win equity-free funding and valuable connections.",
    icon: FaTrophy,
    phase: "Post-Accelerator",
  },
];

const Node = ({ icon: Icon, isActive = true, onClick }) => (
  <motion.div
    className="relative"
    whileHover={{ scale: 1.1 }}
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
  >
    <motion.div
      className={`w-16 h-16 rounded-full bg-white border-4 flex items-center justify-center cursor-pointer
                  ${
                    isActive ? `border-${TROYLABS_ORANGE}` : "border-gray-300"
                  }`}
      animate={{ borderColor: isActive ? TROYLABS_ORANGE : "#E5E7EB" }}
    >
      <Icon size={24} color={isActive ? TROYLABS_ORANGE : "#666666"} />
    </motion.div>
    <AnimatePresence>
      {isActive && (
        <motion.div
          className={`absolute -inset-3 rounded-full border-2 border-${TROYLABS_ORANGE}`}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
          exit={{ scale: 1.2, opacity: 0 }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </AnimatePresence>
  </motion.div>
);

const ProgramJourney = () => {
  const [activeStage, setActiveStage] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStage((prev) => (prev + 1) % programData.length);
    }, 5000); // Change active stage every 5 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full">
      {programData.map((stage, index) => (
        <div key={stage.id} className="flex items-start mb-16">
          <div className="w-32 flex justify-center">
            <Node
              icon={stage.icon}
              isActive={index === activeStage}
              onClick={() => setActiveStage(index)}
            />
          </div>
          <div className="ml-8 flex-grow">
          <div className="w-full flex items-end justify-start gap-4">
            <motion.h3
              className={`text-xl font-bold`}
              animate={{
                color: index === activeStage ? TROYLABS_ORANGE : "#1F2937",
              }}
            >
              {stage.title}
            </motion.h3>
            <motion.h3
              className={`text-xs mb-1 font-normal text-gray-600`}
              
            >
              {stage.phase}
            </motion.h3>
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <p className="mt-2 text-gray-600 max-w-[350px]">{stage.description}</p>
                
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      ))}
    </div>
  );
};

const BuildOverviewSection = () => {
  return (
    <div className="w-full min-h-screen py-16 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="flex flex-col lg:flex-row justify-between items-start mb-16">
          <div className="lg:w-1/2 mb-8 lg:mb-0">
            <h3 className="text-xl text-gray-400 font-medium mb-4 uppercase tracking-wider">
              OVERVIEW
            </h3>
            <h1 className="text-4xl sm:text-5xl max-w-xl leading-tight sm:leading-snug text-gray-800 font-bold mb-6 text-left">
              BUILD is our flagship accelerator that provides
              <span className="text-orange-500 font-semibold">
                {" "}
                hands-on consulting{" "}
              </span>
              to USC's premier startups.
            </h1>
            {/* <motion.button
              className="bg-[#191919] text-white mt-12 px-8 py-3 rounded-full flex items-center"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => window.open("https://forms.gle/Brjdti1Hfp5jgiCa6", "_blank")}
            >
              Apply Now <FaArrowRight className="ml-2" />
            </motion.button> */}
            <p className="text-gray-600 font-medium text-lg max-w-xs">Applications are now closed. They will reopen in Fall 2025</p>
          </div>
          <div className="lg:w-1/2 mt-12 lg:mt-0">
            <ProgramJourney />
          </div>
        </div>
      </div>
    </div>
  );
};

export default BuildOverviewSection;
