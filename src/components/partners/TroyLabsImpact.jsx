import React from 'react';
import { motion } from 'framer-motion';

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

const TroyLabsImpact = () => {
  const stats = [
    {
      icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
      value: "2016",
      label: "Founded",
    },
    {
      icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
      value: "$10M+",
      label: "Raised by Startups",
    },
    {
      icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
      value: "400+",
      label: "Startups Worked With",
    },
    {
      icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
      value: "6000+",
      label: "Event Attendees",
    },
  ];

  return (
    <div className="bg-white w-full pb-24 pt-12 mb:pt-0">
      <div className="mx-auto w-full px-6 lg:px-8">
        <div className="mx-auto max-w-2xl lg:text-center">
          <h2 className="text-base font-semibold leading-7 text-[#FF6B00]">Our Impact</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Driving Innovation at USC
          </p>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Since 2016, TroyLabs has been at the forefront of fostering entrepreneurship and innovation at USC. Our impact extends far beyond campus, reaching into the heart of the Southern California startup ecosystem.
          </p>
        </div>
        <div className="w-full mt-12">
          <dl className="flex flex-row w-full gap-12 md:gap-0 justify-evenly flex-wrap">
            {stats.map((stat) => (
              <div key={stat.label} className="relative">
                <AnimatedStat icon={stat.icon} value={stat.value} label={stat.label} />
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
};

export default TroyLabsImpact;