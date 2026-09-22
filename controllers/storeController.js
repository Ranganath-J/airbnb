const Home = require("../models/home");
const User = require("../models/user");
const Booking = require("../models/booking");

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const renderReserve = (req, res, home, errors = [], oldInput = {}) => {
  res.render("store/reserve", {
    home,
    pageTitle: `Reserve ${home.houseName}`,
    currentPage: "Home",
    isLoggedIn: req.isLoggedIn,
    user: req.session.user,
    errors,
    oldInput,
  });
};

const getBookingDates = (checkIn, checkOut) => {
  const startDate = new Date(checkIn);
  const endDate = new Date(checkOut);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return { error: "Please select valid check-in and check-out dates." };
  }

  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (startDate < today) {
    return { error: "Check-in date cannot be in the past." };
  }

  if (endDate <= startDate) {
    return { error: "Check-out date must be after check-in date." };
  }

  return {
    startDate,
    endDate,
    nights: Math.round((endDate - startDate) / MS_PER_DAY),
  };
};

exports.getIndex = (req, res, next) => {
  console.log("Session Value: ", req.session);
  Home.find().then((registeredHomes) => {
    res.render("store/index", {
      registeredHomes: registeredHomes,
      pageTitle: "airbnb Home",
      currentPage: "index",
      isLoggedIn: req.isLoggedIn, 
      user: req.session.user,
    });
  });
};

exports.getHomes = (req, res, next) => {
  Home.find().then((registeredHomes) => {
    res.render("store/home-list", {
      registeredHomes: registeredHomes,
      pageTitle: "Homes List",
      currentPage: "Home",
      isLoggedIn: req.isLoggedIn, 
      user: req.session.user,
    });
  });
};

exports.getBookings = async (req, res, next) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  try {
    const bookings = await Booking.find({ user: req.session.user._id })
      .populate("home")
      .sort({ createdAt: -1 });

    res.render("store/bookings", {
      bookings,
      pageTitle: "My Bookings",
      currentPage: "bookings",
      isLoggedIn: req.isLoggedIn, 
      user: req.session.user,
    });
  } catch (err) {
    next(err);
  }
};

exports.getFavouriteList = async (req, res, next) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  const userId = req.session.user._id;
  const user = await User.findById(userId).populate('favourites');
  res.render("store/favourite-list", {
    favouriteHomes: user ? user.favourites : [],
    pageTitle: "My Favourites",
    currentPage: "favourites",
    isLoggedIn: req.isLoggedIn, 
    user: req.session.user,
  });
};

exports.postAddToFavourite = async (req, res, next) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  const homeId = req.body.id;
  const userId = req.session.user._id;
  const user = await User.findById(userId);
  if (user && !user.favourites.includes(homeId)) {
    user.favourites.push(homeId);
    await user.save();
  }
  res.redirect("/favourites");
};

exports.postRemoveFromFavourite = async (req, res, next) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  const homeId = req.params.homeId;
  const userId = req.session.user._id;
  const user = await User.findById(userId);
  if (user && user.favourites.includes(homeId)) {
    user.favourites = user.favourites.filter(fav => fav.toString() !== homeId.toString());
    await user.save();
  }
  res.redirect("/favourites");
};

exports.getHomeDetails = (req, res, next) => {
  const homeId = req.params.homeId;
  Home.findById(homeId).then((home) => {
    if (!home) {
      console.log("Home not found");
      res.redirect("/homes");
    } else {
      res.render("store/home-detail", {
        home: home,
        pageTitle: "Home Detail",
        currentPage: "Home",
        isLoggedIn: req.isLoggedIn, 
        user: req.session.user,
      });
    }
  });
};

exports.getReserveHome = async (req, res, next) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  try {
    const home = await Home.findById(req.params.homeId);
    if (!home) {
      return res.redirect("/homes");
    }

    renderReserve(req, res, home);
  } catch (err) {
    next(err);
  }
};

exports.postCreateBooking = async (req, res, next) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  const { homeId, checkIn, checkOut, guests } = req.body;

  try {
    const home = await Home.findById(homeId);
    if (!home) {
      return res.redirect("/homes");
    }

    const oldInput = { checkIn, checkOut, guests };
    const guestCount = Number(guests);

    if (!Number.isInteger(guestCount) || guestCount < 1) {
      return renderReserve(req, res, home, ["Guests must be at least 1."], oldInput);
    }

    const bookingDates = getBookingDates(checkIn, checkOut);
    if (bookingDates.error) {
      return renderReserve(req, res, home, [bookingDates.error], oldInput);
    }

    const overlappingBooking = await Booking.findOne({
      home: home._id,
      status: "booked",
      checkIn: { $lt: bookingDates.endDate },
      checkOut: { $gt: bookingDates.startDate },
    });

    if (overlappingBooking) {
      return renderReserve(req, res, home, ["This home is already booked for the selected dates."], oldInput);
    }

    const booking = new Booking({
      home: home._id,
      user: req.session.user._id,
      checkIn: bookingDates.startDate,
      checkOut: bookingDates.endDate,
      guests: guestCount,
      nights: bookingDates.nights,
      totalPrice: bookingDates.nights * home.price,
    });

    await booking.save();
    res.redirect("/bookings");
  } catch (err) {
    next(err);
  }
};

exports.postCancelBooking = async (req, res, next) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  try {
    await Booking.findOneAndUpdate(
      {
        _id: req.params.bookingId,
        user: req.session.user._id,
        status: "booked",
      },
      { status: "cancelled" }
    );

    res.redirect("/bookings");
  } catch (err) {
    next(err);
  }
};
