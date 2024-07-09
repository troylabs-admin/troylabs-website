import React from "react";
import { motion } from "framer-motion";

import DEMOSpeakers from "../../assets/DEMOSpeakers.JPG";
import DemoKeynote from "../../assets/DEMOKeynote.jpg";
import FinanceImage1 from "../../assets/LaunchGroup.JPG";
import FinanceImage2 from "../../assets/LaunchWinners2024.JPG";
import VCRetreatGroup from "../../assets/DemoPitch.JPG";
import VCRetreatNewMems from "../../assets/DemoBackdrop.JPG";
import PMLaunchWinners from "../../assets/DemoStartup.jpg";
import PMLaunchPresidents from "../../assets/LaunchWinners2024.JPG";
import EngineerDemoTable from "../../assets/DemoTable.jpeg";
import EngineerDemoWorkshop from "../../assets/DemoWorkshop.JPG";
import DesignerDemoStartupBooth from "../../assets/DemoStartupBooth.jpeg";
import MarketerDemoPhoto from "../../assets/DemoPhoto.jpg";
import MarketerDemoEntrance from "../../assets/DemoEntrance.jpeg";
  

const roles = [
    {
      name: "DEMO",
      description:
        "As part of the DEMO team, you'll be at the heart of USC's largest student-run entrepreneurship conference.\n\nYou'll coordinate with industry-leading speakers, innovative startups, and manage event logistics.\n\nThis role offers hands-on experience in event planning, marketing, and networking within the startup ecosystem.",
      style: 1,
      mainImage: DEMOSpeakers,
      secondaryImage: DemoKeynote,
    },
    {
      name: "Finance",
      description:
        "Join the Finance team to drive TroyLabs' financial strategy.\n\nYou'll develop budgets, analyze data, and provide valuable financial insights to our startups.\n\nThis role is perfect for those looking to gain real-world experience in financial management and startup economics.",
      style: 3,
      mainImage: FinanceImage1,
    },
    {
      name: "Venture Capital",
      description:
        "On the VC team, you'll play a crucial role in preparing student-led startups for fundraising.\n\nYou'll assist in finding the right investors, conduct due diligence, and help startups make necessary adjustments to be ready for their seed rounds.\n\nThis role offers invaluable insights into the venture capital process and startup ecosystem.",
      style: 1,
      mainImage: VCRetreatGroup,
      secondaryImage: VCRetreatNewMems,
    },
    {
      name: "Product Manager",
      description:
        "As a Product Manager, you'll guide the development of products for TroyLabs and our startups.\n\nYou'll define product vision, coordinate between teams, and conduct user research.\n\nThis role is ideal for those who want to shape product strategy and drive innovation.",
      style: 2,
      mainImage: PMLaunchPresidents,
      secondaryImage: PMLaunchWinners,
    },
    {
      name: "Engineer",
      description:
        "Join our Engineering team to build cutting-edge solutions for TroyLabs and startups.\n\nYou'll develop web and mobile applications, implement infrastructure, and solve complex technical challenges.\n\nThis role offers hands-on experience with the latest technologies in a fast-paced startup environment.",
      style: 1,
      mainImage: EngineerDemoTable,
      secondaryImage: EngineerDemoWorkshop,
    },
    {
      name: "Designer",
      description:
        "As a Designer, you'll create visually stunning and user-friendly designs for various projects.\n\nFrom crafting intuitive user interfaces to developing brand identities, you'll play a crucial role in shaping the visual language of TroyLabs and our startups.",
      style: 2,
      mainImage: DesignerDemoStartupBooth,
    },
    {
      name: "Marketer",
      description:
        "Join the Marketing team to promote TroyLabs' initiatives and support our startups' growth.\n\nYou'll develop comprehensive marketing strategies, manage social media presence, and create engaging content.\n\nThis role offers a chance to build brands and drive growth in the dynamic world of startups.",
      style: 1,
      mainImage: MarketerDemoPhoto,
      secondaryImage: MarketerDemoEntrance,
    },
  ];

const ImageStyle1 = ({ mainImage, secondaryImage }) => (
  <motion.div
    className="relative"
    whileHover={{ scale: 1.05 }}
    transition={{ duration: 0.3 }}
  >
    <motion.div
      className="absolute top-0 left-0 w-full h-full border-4 border-[#F19E18] rounded-lg"
      initial={{ rotate: 0 }}
      animate={{ rotate: 5 }}
      transition={{ duration: 10, repeat: Infinity, repeatType: "reverse" }}
    />
    <motion.img
      src={mainImage}
      alt="Main"
      className="w-full bg-red-700 h-64 object-cover rounded-lg shadow-lg relative z-10"
      initial={{ rotate: 0 }}
      animate={{ rotate: -5 }}
      transition={{ duration: 10, repeat: Infinity, repeatType: "reverse" }}
    />
    <motion.img
      src={secondaryImage}
      alt="Secondary"
      className="absolute -bottom-10 bg-orange-600 -right-10 w-32 h-32 object-cover rounded-full shadow-lg z-20"
      initial={{ rotate: 0 }}
      animate={{ rotate: 10 }}
      transition={{ duration: 10, repeat: Infinity, repeatType: "reverse" }}
    />
    <svg
      className="absolute -top-5 -left-5 w-20 h-20 z-30"
      viewBox="0 0 100 100"
    >
      <motion.circle
        cx="50"
        cy="50"
        r="45"
        fill="none"
        stroke="#f39c12"
        strokeWidth="2"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{
          duration: 5,
          repeat: Infinity,
          repeatType: "reverse",
          delay: Math.random() * 6,
        }}
      />
    </svg>
  </motion.div>
);

const ImageStyle2 = ({ mainImage, secondaryImage }) => (
  <motion.div
    className="relative"
    whileHover={{ scale: 1.05 }}
    transition={{ duration: 0.3 }}
  >
    <motion.img
      src={mainImage}
      alt="Main"
      className="w-full h-64 bg-red-600 object-cover rounded-lg shadow-lg relative z-10"
      initial={{ y: 0 }}
      animate={{ y: [0, -10, 0] }}
      transition={{ duration: 4, repeat: Infinity }}
    />
   {secondaryImage && <motion.img
      src={secondaryImage}
      alt="Secondary"
      className="absolute -top-10 bg-orange-400 -left-10 w-40 h-40 object-cover rounded-lg shadow-lg z-20 transform -rotate-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1, delay: 0.5 }}
    />}
    <svg
      className="absolute -bottom-5 -right-5 w-24 h-24 z-30"
      viewBox="0 0 100 100"
    >
      <motion.circle
        cx="50"
        cy="50"
        r="45"
        fill="none"
        stroke="#f39c12"
        strokeWidth="2"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{
          duration: 5,
          repeat: Infinity,
          repeatType: "reverse",
          delay: Math.random() * 6,
        }}
      />
    </svg>
  </motion.div>
);

const ImageStyle3 = ({ mainImage, secondaryImage }) => (
  <motion.div
    className="relative"
    whileHover={{ scale: 1.05 }}
    transition={{ duration: 0.3 }}
  >
    <motion.div
      className="absolute top-0 left-0 w-full h-full bg-[#F19E18] rounded-lg"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ duration: 0.5 }}
    />
    <motion.img
      src={mainImage}
      alt="Main"
      className="w-full h-64 object-cover rounded-lg shadow-lg relative z-10 transform -rotate-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    />
  </motion.div>
);

const RoleSection = ({ role, index }) => {
    const isEven = index % 2 === 0;
    const ImageStyle =
      role.style === 1
        ? ImageStyle1
        : role.style === 2
        ? ImageStyle2
        : ImageStyle3;
  
    return (
      <motion.div
        className={`flex items-center w-full justify-between gap-24 mb-32 ${
          isEven ? "flex-col lg:flex-row" : "flex-col-reverse lg:flex-row-reverse"
        }`}
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: index * 0.1 }}
      >
        <div className={`w-full lg:w-1/2 ${isEven ? "lg:pr-10" : "lg:pl-10"}`}>
        <div className="w-full flex flex-row items-center justify-start mb-6 gap-4">
        <h2 className="text-4xl font-light text-gray-300">0{index+1}</h2>
          <h3 className="text-3xl font-bold text-black">{role.name}</h3>
          </div>
          <p className="text-gray-600 font-light leading-snug whitespace-pre-line">
            {role.description}
          </p>
        </div>
        <div className={`w-full lg:w-1/2 ${isEven ? "lg:pl-10" : "lg:pr-10"}`}>
          <ImageStyle
            mainImage={role.mainImage}
            secondaryImage={role.secondaryImage}
          />
        </div>
      </motion.div>
    );
  };

const RolesSection = () => {
  return (
    <div className="w-full overflow-x-hidden py-20">
      <div className="container mx-auto px-4">
        <div className="lg:w-1/2 mb-8 lg:mb-0">
          <h3 className="text-xl text-gray-400 font-medium mb-4 uppercase tracking-wider">
            Our Divisions
          </h3>
          <h1 className="text-4xl sm:text-5xl leading-tight sm:leading-snug text-gray-800 font-bold mb-6 text-left">
            Join a Community of Innovators
          </h1>
          <p className="text-gray-500 max-w-md text-left mb-16">
            At TroyLabs, we offer a diverse range of divisions where you can
            apply your skills, learn new ones, and make a significant impact on
            the entrepreneurial ecosystem.
          </p>
          <div></div>
        </div>
        <div className="w-full px-10 flex flex-col items-center justify-between">
          {roles.map((role, index) => (
            <RoleSection key={role.name} role={role} index={index} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default RolesSection;
