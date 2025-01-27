import React from "react";
import rocket from "../../assets/ignite-rocket.gif";

//https://www.youtube.com/watch?v=MwoluCY7jCk animated rocket

const FlyingRocket = () => {
  return (
    <div className="w-full flex justify-center mt-28">
      <img
        src={rocket}
        alt="rocket gif"
        className="w-52 h-52 transform -rotate-45"
      />
    </div>
  );
};

const OverviewSection = () => {
  const topRowContainer = "rounded-md border border-gray-300 h-80 lg:h-96";
  const bottomRowContainer = "flex-grow rounded-md border border-gray-300 h-80";

  return (
    <div className="w-full flex justify-center min-h-screen py-16 bg-gray-50">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] w-full place-items-center">
        <div className="flex flex-col h-full lg:py-12">
          <h1 className="text-8xl font-bold bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent mb-3">
            IGNITE
          </h1>
          <h2 className="text-lg font-bold text-gray-800">
            Your fuel for entrepreneurship
          </h2>
          <FlyingRocket />
        </div>
        <div className="w-7/12 lg:w-full flex gap-10 flex-col justify-center items-center px-8">
          <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-10">
            <div className={topRowContainer}>item</div>
            <div className={topRowContainer}>item</div>
          </div>
          <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-10 justify-center">
            <div className={bottomRowContainer}>item</div>
            <div className={bottomRowContainer}>item</div>
            <div className={bottomRowContainer}>item</div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default OverviewSection;
