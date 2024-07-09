import React from 'react';
import { motion } from 'framer-motion';
import { FaDollarSign, FaCalendarAlt, FaHandshake, FaArrowRight } from 'react-icons/fa';

const outlineVariants = {
  initial: { pathLength: 0 },
  animate: { 
    pathLength: 1, 
    transition: { duration: 4, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }
  }
};

const SupportOption = ({ icon: Icon, title, description, buttonText }) => {
  return (
    <motion.div 
      className="relative"
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    > 
      <div className="relative z-10 flex flex-col items-center justify-center ">
        <div className="w-20 h-20 bg-gradient-to-br from-[#F19E18] to-[#E62314] rounded-full flex items-center justify-center mb-6 shadow-lg relative">
          <Icon className="text-white text-4xl relative z-10" />
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
            <motion.circle
              cx="50" cy="50" r="48"
              stroke="white" strokeWidth="2" fill="none"
              variants={outlineVariants}
              initial="initial"
              animate="animate"
            />
          </svg>
        </div>
        <h3 className="text-2xl font-bold mb-3 text-gray-800">{title}</h3>
        <p className="text-gray-600 mb-6 max-w-[80%] text-center h-24">{description}</p>
        <motion.a
        href="mailto:troylabs@usc.edu"
          className="inline-flex items-center px-6 py-2 border-2 border-[#E62314] text-[#E62314] font-medium rounded-full hover:bg-[#E62314] hover:text-white transition-all duration-300"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {buttonText}
          <FaArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </motion.a>
      </div>
    </motion.div>
  );
};

const TroyLabsSupportOptions = () => {
  const supportOptions = [
    {
      icon: FaDollarSign,
      title: "Make a Donation",
      description: "Fuel our mission to empower student entrepreneurs and drive innovation at USC.",
      buttonText: "Donate Now",
      svgVariant: {
        position: "-top-20 -left-20",
        path: "M10,50 Q25,25 50,50 T90,50"
      }
    },
    {
      icon: FaCalendarAlt,
      title: "Host an Event",
      description: "Collaborate with us to create impactful events. Your expertise can help shape the next generation of entrepreneurs.",
      buttonText: "Plan an Event",
      svgVariant: {
        position: "-bottom-20 -right-20",
        path: "M10,90 Q50,10 90,90"
      }
    },
    {
      icon: FaHandshake,
      title: "Partner & Recruit",
      description: "Gain direct access to some of USC's top entrepreneurial talent, with people specialized in a variety of fields.",
      buttonText: "Explore Partnerships",
      svgVariant: {
        position: "-top-20 -right-20",
        path: "M10,10 Q50,90 90,10"
      }
    }
  ];

  return (
    <div className="bg-white py-24 sm:py-32 overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div 
          className="mx-auto max-w-2xl text-center mb-16"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Support TroyLabs</h2>
          <p className="mt-4 text-lg leading-8 text-gray-600">
            Join us in fostering innovation and entrepreneurship at USC. Your support can make a lasting impact on the future of technology and business.
          </p>
        </motion.div>
        <div className="grid grid-cols-1 gap-16 md:grid-cols-2 items-center lg:grid-cols-3">
          {supportOptions.map((option, index) => (
            <SupportOption key={index} {...option} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default TroyLabsSupportOptions;