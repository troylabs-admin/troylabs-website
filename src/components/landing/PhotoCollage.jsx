import React from "react";
import { motion } from "framer-motion";
import { FaChevronDown } from "react-icons/fa";

import Boat from "../../assets/Boat.jpg";
import DEMOTLGroupPhoto from "../../assets/DEMO_TLGroupPhoto.JPG";
import DEMOKeynote from "../../assets/DEMOKeynote.jpg";
import DEMOSpeakers from "../../assets/DEMOSpeakers.JPG";
import RetreatGroup from "../../assets/RetreatGroup.jpg";
import RetreatNewMems from "../../assets/RetreatNewMems.jpg";
import RetreatSeniors from "../../assets/RetreatSeniors.jpg";
import TL4L from "../../assets/TL4L.JPG";

const ImageCard = ({
  image,
  left,
  top,
  width,
  height,
  delay,
  isBlurred = false,
}) => {
  return (
    <motion.div
      className={`absolute rounded-lg overflow-hidden shadow-md`}
      style={{ left, top, width, height }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ scale: 1.05 }}
    >
      <div
        className="w-full h-full bg-cover bg-center"
        style={{
          backgroundImage: `url(${image})`,
          filter: isBlurred ? "blur(0.5px)" : "none",
          transform: isBlurred ? "scale(1.05)" : "none",
        }}
      />
    </motion.div>
  );
};

const InfoCard = ({ title, left, top, delay, color }) => {
  return (
    <motion.div
      className="absolute bg-white rounded-[10px] z-[90] shadow-lg overflow-hidden"
      style={{
        left,
        top,
        height: "auto",
        boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
      }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ scale: 1.05 }}
    >
      <div className={`p-2 px-4 ${color} text-white drop-shadow`}>
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium">{title}</h3>
        </div>
      </div>
    </motion.div>
  );
};

const PhotoCollage = () => {
  return (
    <div
      className="hidden md:block relative overflow-hidden w-full mt-24 h-[842px] mx-auto"
      style={{ maxWidth: "984px" }}
    >
      <ImageCard
        image={DEMOTLGroupPhoto}
        title="DEMO TroyLabs Group"
        description="Our team at DEMO"
        left="180px"
        top="70px"
        width="320px"
        height="320px"
        delay={0}
      />
      <ImageCard
        image={RetreatGroup}
        title="Retreat Group Photo"
        description="Team bonding retreat"
        left="520px"
        top="130px"
        width="260px"
        height="260px"
        delay={0.1}
      />
      <ImageCard
        image={RetreatSeniors}
        title="Senior Members"
        description="Experienced leaders"
        left="360px"
        top="410px"
        width="300px"
        height="300px"
        delay={0.2}
      />

      <InfoCard
        title="Professional Growth"
        left="289px"
        top="650px"
        delay={0.6}
        color="bg-gradient-to-b from-[#F19E18] to-[#E09316]"
      />
      <InfoCard
        title="Entrepreneurship"
        left="687px"
        top="98px"
        delay={0.8}
        color="bg-gradient-to-b from-[#F19E18] to-[#E09316]"
      />
      <InfoCard
        title="Community"
        left="107px"
        top="327px"
        delay={1}
        color="bg-gradient-to-b from-[#F19E18] to-[#E09316]"
      />

      <ImageCard
        image={DEMOKeynote}
        title="DEMO Keynote"
        description="Industry leader talks"
        left="190px"
        top="430px"
        width="150px"
        height="150px"
        delay={0.3}
        isBlurred={true}
      />
      <ImageCard
        image={RetreatNewMems}
        title="New Members"
        description="Fresh talent welcome"
        left="10px"
        top="100px"
        width="160px"
        height="160px"
        delay={0.4}
        isBlurred={true}
      />
      <ImageCard
        image={DEMOSpeakers}
        title="DEMO Speakers"
        description="Expert panels"
        left="520px"
        top="0px"
        width="120px"
        height="120px"
        delay={0.5}
        isBlurred={true}
      />
      <ImageCard
        image={Boat}
        title="Boat Trip"
        description="Social event on water"
        left="800px"
        top="250px"
        width="150px"
        height="150px"
        delay={0.6}
        isBlurred={true}
      />
      <ImageCard
        image={TL4L}
        title="TroyLabs for Life"
        description="Lasting community impact"
        left="680px"
        top="440px"
        width="180px"
        height="180px"
        delay={0.7}
        isBlurred={true}
      />
    </div>
  );
};

export default PhotoCollage;