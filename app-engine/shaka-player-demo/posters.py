# Shaka Player Demo - Poster Definitions
# Copyright 2022 Google LLC
# SPDX-License-Identifier: Apache-2.0

# A Doodle-like service to change the poster on certain days.
# All posters are chosen based on the current date in PST.

# Month constants to make specific dates easier to read.
JANUARY = 1
FEBRUARY = 2
MARCH = 3
APRIL = 4
MAY = 5
JUNE = 6
JULY = 7
AUGUST = 8
SEPTEMBER = 9
OCTOBER = 10
NOVEMBER = 11
DECEMBER = 12

# Special posters for certain days.
VIDEO_POSTERS = {
  # These are the same every year:
  # =====
  (FEBRUARY, 14): 'valentines.png',
  (APRIL, 1): 'colorbars.gif',
  (APRIL, 5): 'trek.jpg',  # "First Contact Day": https://bit.ly/2CSXbxw
  (OCTOBER, 31): 'zombie.jpg',
  # =====

  # These birthday posters changed each year:
  (DECEMBER, 19, 2015): '1yo.jpg',
  (DECEMBER, 19, 2016): '2yo.png',
  (DECEMBER, 19, 2017): '3yo.png',

  # After this, the birthday poster shows for a whole week:
  (DECEMBER, 17, 2018): '4yo.png',
  (DECEMBER, 18, 2018): '4yo.png',
  (DECEMBER, 19, 2018): '4yo.png',
  (DECEMBER, 20, 2018): '4yo.png',

  (DECEMBER, 19, 2019): '5yo.png',
  (DECEMBER, 20, 2019): '5yo.png',
  (DECEMBER, 21, 2019): '5yo.png',
  (DECEMBER, 22, 2019): '5yo.png',
  (DECEMBER, 23, 2019): '5yo.png',
  (DECEMBER, 24, 2019): '5yo.png',
  (DECEMBER, 25, 2019): '5yo.png',

  (DECEMBER, 19, 2020): '6yo.png',
  (DECEMBER, 20, 2020): '6yo.png',
  (DECEMBER, 21, 2020): '6yo.png',
  (DECEMBER, 22, 2020): '6yo.png',
  (DECEMBER, 23, 2020): '6yo.png',
  (DECEMBER, 24, 2020): '6yo.png',
  (DECEMBER, 25, 2020): '6yo.png',

  (DECEMBER, 19, 2021): '7yo.png',
  (DECEMBER, 20, 2021): '7yo.png',
  (DECEMBER, 21, 2021): '7yo.png',
  (DECEMBER, 22, 2021): '7yo.png',
  (DECEMBER, 23, 2021): '7yo.png',
  (DECEMBER, 24, 2021): '7yo.png',
  (DECEMBER, 25, 2021): '7yo.png',

  (DECEMBER, 19, 2022): '8yo.png',
  (DECEMBER, 20, 2022): '8yo.png',
  (DECEMBER, 21, 2022): '8yo.png',
  (DECEMBER, 22, 2022): '8yo.png',
  (DECEMBER, 23, 2022): '8yo.png',
  (DECEMBER, 24, 2022): '8yo.png',
  (DECEMBER, 25, 2022): '8yo.png',

  (DECEMBER, 19, 2023): '9yo.png',
  (DECEMBER, 20, 2023): '9yo.png',
  (DECEMBER, 21, 2023): '9yo.png',
  (DECEMBER, 22, 2023): '9yo.png',
  (DECEMBER, 23, 2023): '9yo.png',
  (DECEMBER, 24, 2023): '9yo.png',
  (DECEMBER, 25, 2023): '9yo.png',

  (DECEMBER, 19, 2024): '10yo.png',
  (DECEMBER, 20, 2024): '10yo.png',
  (DECEMBER, 21, 2024): '10yo.png',
  (DECEMBER, 22, 2024): '10yo.png',
  (DECEMBER, 23, 2024): '10yo.png',
  (DECEMBER, 24, 2024): '10yo.png',
  (DECEMBER, 25, 2024): '10yo.png',
}

# The default poster.
VIDEO_DEFAULT = 'standard.png'

# Special audio-only posters.
AUDIO_POSTERS = {
  # http://discordia.wikia.com/wiki/Chaoflux
  (FEBRUARY, 19): 'audioRickRoll.gif',
  # http://discordia.wikia.com/wiki/Discoflux
  (MAY, 3): 'audioRickRoll.gif',
  # http://discordia.wikia.com/wiki/Confuflux
  (JULY, 15): 'audioRickRoll.gif',
  # http://discordia.wikia.com/wiki/Bureflux
  (SEPTEMBER, 26): 'audioRickRoll.gif',
  # http://discordia.wikia.com/wiki/Afflux
  (DECEMBER, 8): 'audioRickRoll.gif',
}

# The default audio-only poster.
AUDIO_DEFAULT = 'audioOnly.gif'
