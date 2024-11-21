let accessToken = '';
let checkInDate = '';
let checkOutDate = '';
let adults = 1;
let numberOfRooms = 1;
let email = '';
let formCurrency = 'SEK';
let destination = '';
let selectedHotels = []; // Array to store selected hotels

/**
 * Retrieves the access token from the backend.
 */
async function getAccessToken() {
    try {
        const tokenResponse = await fetch('/api/getAccessToken');
        if (!tokenResponse.ok) {
            throw new Error('Failed to retrieve access token.');
        }
        const tokenData = await tokenResponse.json();
        accessToken = tokenData.access_token;
        console.log('Access Token obtained:', accessToken);
    } catch (error) {
        console.error('Error obtaining access token:', error.message);
        alert('Failed to obtain access token. Please try again later.');
    }
}

$(document).ready(async function() {

    // ------- STEP 0: Load Page and Initialize ----------
    const queryParams = new URLSearchParams(window.location.search);
    $('#email').val(queryParams.get('email'));
    $('#currency').val(queryParams.get('currency')).trigger('change');
    $('#destination').val(queryParams.get('city'));

    const resultsContainer = $('#resultsBox'); // Container to display hotel results

    /**
     * Displays the flight tracking modal.
     */
    function askForFlightTracking() {
        console.log('Displaying flight tracking modal.');
        $('#flightTrackingModal').modal('show');
    }

    // Initialize Flatpickr for date range selection
    const datePicker = flatpickr('.datepicker', {
        mode: "range",
        dateFormat: "j M Y", // Format for display (e.g., "24 Jan 2024")
        altInput: true,
        altFormat: "j M Y", // Display format for the user
        minDate: 'today',
        locale: {
            firstDayOfWeek: 1 // Set Monday as the first day of the week
        },
        onChange: function(selectedDates, dateStr, instance) {
            // Trigger input event for further processing
            instance.element.dispatchEvent(new Event('input'));
        }
    });

    // Currencies
    $.get('https://api.ipgeolocation.io/ipgeo?apiKey=420e90eecc6c4bb285f238f38aea898f', function(response) {
        currency = response.currency.code;
        console.log('Setting currency to:',currency);
        // Update the currency based on the IP-response
        $('#currency').val(currency).trigger('change');
    });

    // Set dates from URL parameters if available
    if (queryParams.get('dateFrom') && queryParams.get('dateTo')) {
        const dateFrom = queryParams.get('dateFrom');
        const dateTo = queryParams.get('dateTo');
        datePicker.setDate([dateFrom, dateTo], true, "d/m/Y");
    }

    /**
     * Formats a Date object to an ISO string without timezone.
     * @param {Date} date - The date to format.
     * @returns {string} - Formatted date string.
     */
    function formatDateToLocalISOString(date) {
        if (!date) return '';
        const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
        return localDate.toISOString().split('T')[0];
    }

    // ---------- Step 2: Utility Functions ---------------

    /**
     * Fetches geographic coordinates for a given destination.
     * @param {string} destination - The destination to get coordinates for.
     * @returns {Promise<object>} - An object containing latitude and longitude.
     */
    async function getLocationCoordinates(destination) {
        console.log('Getting coordinates for destination:', destination);
        const apiUrl = `/api/getCoordinatesByLocation?location=${encodeURIComponent(destination)}`;

        try {
            const response = await fetch(apiUrl);
            if (!response.ok) {
                throw new Error(`Error: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('Coordinates:', data);
            return data;
        } catch (error) {
            console.error('Error fetching coordinates:', error.message);
            alert('Failed to fetch coordinates. Please try again later.');
            throw error;
        }
    }

    /**
     * Fetches hotels based on geographic coordinates.
     * @param {number} lat - Latitude.
     * @param {number} lng - Longitude.
     * @returns {Promise<Array>} - Array of hotels.
     */
    async function fetchHotelsByCoordinates(lat, lng) {
        console.log(`Fetching hotels at Latitude: ${lat}, Longitude: ${lng}`);
        const apiUrl = `/api/getHotelsByCoordinates?latitude=${lat}&longitude=${lng}&radius=10&radiusUnit=KM&hotelSource=ALL`;
        try {
            const response = await fetch(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch hotels.');
            }

            const hotelsData = await response.json();
            console.log('Hotels Data:', hotelsData);
            return hotelsData.data; // Assuming 'data' contains the array of hotels
        } catch (error) {
            console.error('Error fetching hotels by coordinates:', error.message);
            alert('Failed to fetch hotels. Please try again later.');
            throw error;
        }
    }

    /**
     * Fetches hotel offers for a list of hotel IDs.
     * @param {Array<string>} hotelIds - Array of hotel IDs.
     * @returns {Promise<Array>} - Array of hotel offers.
     */
    async function fetchHotelOffers(hotelIds) {
        const limitedHotelIds = hotelIds.slice(0, 20); // Limit to 20 IDs per request
        const params = new URLSearchParams({
            hotelIds: limitedHotelIds.join(','), // Assuming the API expects comma-separated IDs
            adults: adults,
            checkInDate: checkInDate,
            checkOutDate: checkOutDate,
            roomQuantity: numberOfRooms,
            paymentPolicy: 'NONE',
            bestRateOnly: true,
            includeClosed: false
        });

        const url = `/api/getHotelOffers?${params.toString()}`;
        console.log('Fetching hotel offers with params:', params.toString());

        try {
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            const text = await response.text();

            try {
                const responseData = JSON.parse(text);
                console.log('Hotel offers response:', responseData.data);

                if (responseData.message) { // Check for the message
                    resultsContainer.html(`<div class="no-results-message">${responseData.message}</div>`);
                    return []; // Return empty array to indicate no offers
                }

                if (responseData.errors) {
                    const errorDetails = responseData.errors.map(err => `Code: ${err.code}, Detail: ${err.detail}`).join('; ');
                    throw new Error(`Failed to fetch hotel offers: ${errorDetails}`);
                }

                return responseData.data; // Return valid offers

            } catch (err) {
                throw new Error(`Failed to parse hotel offers response: ${text}`);
            }

        } catch (error) {
            console.error('Error fetching hotel offers:', error.message);
            alert('Failed to fetch hotel offers. Please try again later.');
            throw error;
        }
    }

    /**
     * Fetches ratings for a list of hotel offers.
     * @param {Array} hotelOffers - Array of hotel offer objects.
     * @returns {Promise<Array>} - Array of hotel offers with added ratings.
     */
    async function fetchHotelRatings(hotelOffers) {
        const hotelIds = hotelOffers.map(offer => offer.hotel.hotelId);
        const chunkSize = 3;
        console.log('Fetching ratings for hotel IDs:', hotelIds);

        /**
         * Splits an array into chunks of specified size.
         * @param {Array} array - The array to split.
         * @param {number} size - The size of each chunk.
         * @returns {Array<Array>} - Array of chunks.
         */
        function chunkArray(array, size) {
            const result = [];
            for (let i = 0; i < array.length; i += size) {
                result.push(array.slice(i, i + size));
            }
            return result;
        }

        const hotelChunks = chunkArray(hotelIds, chunkSize);
        console.log('Hotel ID Chunks:', hotelChunks);

        const updatedOffers = [...hotelOffers]; // Create a copy to add ratings

        // Fetch ratings for each chunk
        for (const chunk of hotelChunks) {
            try {
                const response = await fetch('/api/getHotelRatings', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ hotelIds: chunk })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Error fetching hotel ratings: ${errorText}`);
                }

                const ratingsData = await response.json();
                console.log('Ratings Data for Chunk:', chunk, ratingsData);

                // Add ratings to the corresponding hotels in updatedOffers
                ratingsData.forEach(rating => {
                    const hotel = updatedOffers.find(h => h.hotel.hotelId === rating.hotelId);
                    if (hotel) {
                        hotel.rating = rating.overallRating || 'N/A'; // Add rating
                    }
                });
            } catch (error) {
                console.error(`Error fetching ratings for chunk ${chunk}:`, error.message);
                alert(`Failed to fetch ratings for some hotels. Some ratings may be missing.`);
            }
        }

        return updatedOffers; // Return the updated offers with ratings
    }

    /**
     * Displays hotel offers in the UI.
     * @param {Array} hotelOffers - Array of hotel offer objects with ratings.
     * @param {number} destinationLat - Destination latitude.
     * @param {number} destinationLng - Destination longitude.
     * @param {number} numberOfNights - Number of nights.
     */
    function displayHotelResults(hotelOffers, destinationLat, destinationLng, numberOfNights) {
        $('#resultsBox').empty(); // Clear previous results

        if (hotelOffers.length === 0) {
            $('#noResultsMessage').show();
            $('#resultsBox').hide();
            return;
        }

        $('#resultsBox').show(); // Ensure the results box is visible

        // Sort hotel offers by distance to the destination
        const sortedOffers = hotelOffers.sort((a, b) => {
            const distanceA = calculateDistance(a.hotel.latitude, a.hotel.longitude, destinationLat, destinationLng);
            const distanceB = calculateDistance(b.hotel.latitude, b.hotel.longitude, destinationLat, destinationLng);
            return distanceA - distanceB; // Ascending order
        });

        // Display sorted hotel offers
        sortedOffers.forEach(offer => {
            // Preprocess the data with the formatting functions
            const formattedHotelName = formatHotelName(offer.hotel.name || 'Unknown Hotel');
            const formattedRoomType = formatRoomType(offer.offers?.[0]?.room?.typeEstimated?.category || 'N/A');
            const formattedDistance = calculateDistance(offer.hotel.latitude, offer.hotel.longitude, destinationLat, destinationLng);

            // Calculate price details
            const totalPrice = parseFloat(offer.offers[0].price.total);
            const pricePerNight = (totalPrice / numberOfNights).toFixed(2);

            // Create the card with the formatted data
            const card = createHotelCard({
                hotelId: offer.hotel.hotelId,
                hotelName: formattedHotelName,
                roomType: formattedRoomType,
                distance: `${formattedDistance} km`,
                totalPrice: totalPrice.toFixed(2),
                pricePerNight: pricePerNight,
                rating: offer.rating // Use the fetched rating
            });

            console.log('Created a card for:', offer.hotel.hotelId);
            $('#resultsBox').append(card);
        });
    }

    /**
     * Resets the UI before a new submission.
     */
    function resetUIForSubmission() {
        $('#noResultsMessage').hide();
        $('#submitText').hide();
        $('.loader').show();
    }

    /**
     * Retrieves and validates form data.
     * @returns {object} - The form data.
     */
    function getFormData() {
        destination = $('#destination').val();  // Assign directly to global variable
        const dateRange = datePicker.selectedDates;
        adults = parseInt($('#adults').val(), 10) || 1;
        numberOfRooms = parseInt($('#numberOfRooms').val(), 10) || 1;
        email = $('#email').val();
        formCurrency = $('#currency').val();

        checkInDate = formatDateToLocalISOString(dateRange[0]);
        checkOutDate = formatDateToLocalISOString(dateRange[1]);
        const numberOfNights = dateRange[1] && dateRange[0] ? Math.round((dateRange[1] - dateRange[0]) / (1000 * 60 * 60 * 24)) : 0;

        return { destination, checkInDate, checkOutDate, adults, numberOfRooms, email, formCurrency, numberOfNights };
    }

    /**
     * Submits data to Sheety API.
     * @param {object} formData - Form data.
     * @param {object} formattedData - Formatted selected hotels data.
     * @returns {Promise<object>} - Response from Sheety.
     */
    async function submitToSheety(formData, formattedData) {
        const data = {
            location: formData.destination,
            checkInDate: formData.checkInDate,
            checkOutDate: formData.checkOutDate,
            adults: formData.adults,
            numberOfRooms: formData.numberOfRooms,
            email: formData.email,
            currency: formData.formCurrency,
            selectedHotels: formattedData.selectedHotels.length > 0 ? formattedData.selectedHotels : [{ message: "No hotels selected" }]
        };

        console.log('Submitting to Sheety with data:', JSON.stringify(data, null, 2));

        try {
            const response = await fetch('/api/sendDataToSheety', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const responseData = await response.json();

            if (response.ok) {
                console.log('Data successfully submitted to Sheety:', responseData);
                return responseData;
            } else {
                console.error('Error submitting data to Sheety:', responseData);
                alert(`Failed to submit data to Sheety: ${responseData.error || 'Unknown error'}`);
                throw new Error(`Sheety Error: ${responseData.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Error sending data to Sheety:', error.message);
            alert('Failed to submit data to Sheety. Please try again later.');
            throw error;
        }
    }

    /**
     * Sends an email with the submission details.
     * @param {string} destination - Destination location.
     * @param {string} checkInDate - Check-in date.
     * @param {string} checkOutDate - Check-out date.
     * @param {number} adults - Number of adults.
     * @param {number} numberOfRooms - Number of rooms.
     * @param {string} email - User's email.
     * @param {string} formCurrency - Currency used in the form.
     * @param {Array} selectedHotels - Array of selected hotels.
     */
    async function sendEmail(destination, checkInDate, checkOutDate, adults, numberOfRooms, email, formCurrency, selectedHotels) {
        try {
            const emailResponse = await fetch('/api/sendMail', { // Corrected endpoint casing
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    subject: "New submission for your Hotel Robot",
                    body: `
                        Great news, somebody just signed up for your Hotel Robot! Here are the details:<br><br>
                        Destination: ${destination}<br>
                        Check-In Date: ${checkInDate}<br>
                        Check-Out Date: ${checkOutDate}<br>
                        Adults: ${adults}<br>
                        Number of Rooms: ${numberOfRooms}<br>
                        Email: ${email}<br>
                        Currency: ${formCurrency}<br>
                        Selected Hotels:<br>
                        ${selectedHotels.length > 0 
                            ? selectedHotels.map(hotel => `- ${hotel.hotelName} (${hotel.rating})<br>`).join('')
                            : 'No hotels selected'}<br><br>
                        Thank you!
                    `,
                    recipient_email: email
                })
            });

            if (!emailResponse.ok) {
                const errorData = await emailResponse.json();
                console.error('Failed to send email:', errorData);
                alert('Submission successful, but failed to send confirmation email.');
            } else {
                console.log('Email sent successfully.');
            }
        } catch (emailError) {
            console.error('Error during email sending:', emailError.message);
            alert('Submission successful, but encountered an error while sending confirmation email.');
        }
    }

    // ---------- Step 3.5: Display Results ---------------

    /**
     * Creates a hotel card element with provided details.
     * @param {object} result - Object containing hotel details.
     * @returns {jQuery} - jQuery element representing the hotel card.
     */
    function createHotelCard(result) {
        const card = $('<div>').addClass('card');

        // Add hidden hotelId element
        const hiddenHotelId = $('<div>').addClass('hiddenHotelId').text(result.hotelId).hide();
        card.append(hiddenHotelId);

        // Card Header with hotel name
        const cardHeader = $('<div>').addClass('card-header');
        cardHeader.append($('<div>').text(result.hotelName).addClass('hotel-name'));
        card.append(cardHeader);

        // Add room type below hotel name
        const roomType = $('<div>').text(result.roomType).addClass('room-type');
        card.append(roomType);

        // Add the distance in a separate container
        const distanceContainer = $('<div>').addClass('distance').text(`${result.distance}`);
        card.append(distanceContainer);

        // Add Price per Night
        const pricePerNightDiv = $('<div>').addClass('price-per-night');
        pricePerNightDiv.append($('<span>').addClass('label').text('Per Night: '));
        pricePerNightDiv.append($('<span>').addClass('amount').text(`${result.pricePerNight}`));
        card.append(pricePerNightDiv);

        // Add Total Price
        const totalPriceDiv = $('<div>').addClass('total-price');
        totalPriceDiv.append($('<span>').addClass('label').text('Total: '));
        totalPriceDiv.append($('<span>').addClass('amount').text(`${result.totalPrice}`));
        card.append(totalPriceDiv);

        // Add Rating
        const ratingDiv = $('<div>').addClass('rating');
        ratingDiv.append($('<span>').addClass('label').text('Rating: '));
        ratingDiv.append($('<span>').addClass('rating-value').text(result.rating));
        card.append(ratingDiv);

        // Create a container for the checkbox and its label
        const checkboxContainer = $('<div>').addClass('checkbox-container');
        checkboxContainer.append($('<span>').addClass('checkbox-description').text('Add to Robot: '));
        checkboxContainer.append($('<input>').attr('type', 'checkbox').addClass('select-checkbox'));
        card.append(checkboxContainer);

        return card;
    }

    // ---------- Step 4: Search Form Submission -----------
    $('#searchForm').on('submit', async function(event) {
        event.preventDefault();  // Prevent default form submission behavior
        resetUIForSubmission();  // Reset the UI before starting the submission

        // Step 4.1 Retrieve form data and validate
        const { destination, checkInDate, checkOutDate, adults, numberOfRooms, email, formCurrency, numberOfNights } = getFormData();
        if (!checkInDate || !checkOutDate || numberOfNights <= 0) {
            alert('Please enter valid check-in and check-out dates.');
            $('.datepicker').focus();
            hideLoading();
            return;
        }

        // Log the form data
        console.log('Form Data:', { destination, checkInDate, checkOutDate, adults, numberOfRooms, email, formCurrency });

        let fxRates = {};

        try {
            console.log('Fetching access token...');
            await getAccessToken(); // Await the access token

            console.log('Fetching FX rates for form currency:', formCurrency);
            const fxRatesResponse = await fetch(`/api/getFxRates?baseCurrency=${formCurrency}`);
            if (!fxRatesResponse.ok) {
                throw new Error('Failed to fetch FX rates.');
            }
            fxRates = await fxRatesResponse.json();
            console.log('Fetched FX Rates:', fxRates);

            console.log('Fetching location coordinates...');
            const locationCoordinates = await getLocationCoordinates(destination);

            console.log('Fetching hotels by coordinates...');
            const hotelsData = await fetchHotelsByCoordinates(locationCoordinates.lat, locationCoordinates.lng);

            if (!hotelsData || hotelsData.length === 0) {
                alert('No hotels found in the selected area.');
                return;
            }

            console.log('Extracting hotel IDs...');
            const hotelIds = hotelsData.map(hotel => hotel.hotelId);

            console.log('Fetching hotel offers...');
            const hotelOffers = await fetchHotelOffers(hotelIds);

            if (!hotelOffers || hotelOffers.length === 0) {
                alert('No hotel offers available for the selected criteria.');
                return;
            }

            console.log('Converting hotel offer prices to form currency...');
            const convertedOffers = convertPricesToFormCurrency(hotelOffers, fxRates, formCurrency);
            console.log('Converted Offers:', convertedOffers);

            console.log('Fetching hotel ratings...');
            const hotelRatings = await fetchHotelRatings(convertedOffers);
            console.log('Hotel Offers with Ratings:', hotelRatings);

            console.log('Displaying hotel results...');
            displayHotelResults(hotelRatings, locationCoordinates.lat, locationCoordinates.lng, numberOfNights);

        } catch (error) {
            console.error('Error during form submission:', error.message);
            $('#noResultsMessage').show();
        } finally {
            $('.loader').hide();
        }
    });

    /**
     * Handles changes to hotel selection checkboxes.
     */
    function handleCheckboxChange() {
        console.log('Checkbox changed');

        // Get all checked checkboxes
        const checkedCheckboxes = $('#resultsBox .card input[type="checkbox"]:checked');
        console.log('Checked checkboxes count:', checkedCheckboxes.length);

        // Toggle the submit button visibility based on checkbox selection
        $('#submitToSheet').toggle(checkedCheckboxes.length > 0);

        // Update the selectedHotels array based on checked boxes
        selectedHotels = checkedCheckboxes.map(function() {
            const card = $(this).closest('.card');
            const hotelId = card.find('.hiddenHotelId').text();
            const hotelName = card.find('.hotel-name').text();
            const roomType = card.find('.room-type').text();
            const pricePerNight = card.find('.price-per-night .amount').text();
            const totalPrice = card.find('.total-price .amount').text();
            const rating = card.find('.rating-value').text();

            // Log the selected hotel information
            console.log('Selected Hotel Info:', {
                hotelId,
                hotelName,
                roomType,
                pricePerNight,
                totalPrice,
                rating
            });

            return {
                hotelId,
                hotelName,
                roomType,
                pricePerNight,
                totalPrice,
                rating
            };
        }).get();
    }

    /**
     * Toggles the checkbox state and updates selection.
     * @param {Event} event - The click event.
     * @param {jQuery} container - The checkbox container element.
     */
    function toggleCheckbox(event, container) {
        event.stopPropagation(); // Prevent event bubbling
        const checkbox = container.find('input[type="checkbox"]');
        checkbox.prop('checked', !checkbox.prop('checked')).trigger('change'); // Toggle and trigger change
        handleCheckboxChange();
    }

    // Attach event listeners to checkboxes and their containers
    $('#resultsBox').on('click', '.checkbox-container', function(event) {
        toggleCheckbox(event, $(this));
    });

    $('#resultsBox').on('click', '.select-checkbox', function(event) {
        toggleCheckbox(event, $(this).closest('.checkbox-container'));
    });

    /**
     * Creates a hotel card element with provided details.
     * @param {object} result - Object containing hotel details.
     * @returns {jQuery} - jQuery element representing the hotel card.
     */
    function createHotelCard(result) {
        const card = $('<div>').addClass('card');

        // Add hidden hotelId element
        const hiddenHotelId = $('<div>').addClass('hiddenHotelId').text(result.hotelId).hide();
        card.append(hiddenHotelId);

        // Card Header with hotel name
        const cardHeader = $('<div>').addClass('card-header');
        cardHeader.append($('<div>').text(result.hotelName).addClass('hotel-name'));
        card.append(cardHeader);

        // Add room type below hotel name
        const roomType = $('<div>').text(result.roomType).addClass('room-type');
        card.append(roomType);

        // Add the distance in a separate container
        const distanceContainer = $('<div>').addClass('distance').text(`${result.distance}`);
        card.append(distanceContainer);

        // Add Price per Night
        const pricePerNightDiv = $('<div>').addClass('price-per-night');
        pricePerNightDiv.append($('<span>').addClass('label').text('Per Night: '));
        pricePerNightDiv.append($('<span>').addClass('amount').text(`${result.pricePerNight}`));
        card.append(pricePerNightDiv);

        // Add Total Price
        const totalPriceDiv = $('<div>').addClass('total-price');
        totalPriceDiv.append($('<span>').addClass('label').text('Total: '));
        totalPriceDiv.append($('<span>').addClass('amount').text(`${result.totalPrice}`));
        card.append(totalPriceDiv);

        // Add Rating
        const ratingDiv = $('<div>').addClass('rating');
        ratingDiv.append($('<span>').addClass('label').text('Rating: '));
        ratingDiv.append($('<span>').addClass('rating-value').text(result.rating));
        card.append(ratingDiv);

        // Create a container for the checkbox and its label
        const checkboxContainer = $('<div>').addClass('checkbox-container');
        checkboxContainer.append($('<span>').addClass('checkbox-description').text('Add to Robot: '));
        checkboxContainer.append($('<input>').attr('type', 'checkbox').addClass('select-checkbox'));
        card.append(checkboxContainer);

        return card;
    }

    /**
     * Converts hotel offer prices to the form's currency using FX rates.
     * @param {Array} hotelOffers - Array of hotel offer objects.
     * @param {object} fxRates - Object containing currency exchange rates.
     * @param {string} formCurrency - Target currency code (e.g., 'USD').
     * @returns {Array} - Array of hotel offers with converted prices.
     */
    function convertPricesToFormCurrency(hotelOffers, fxRates, formCurrency) {
        return hotelOffers.map(offer => {
            const offerCurrency = offer.offers[0].price.currency;

            // Ensure the FX rate exists for the offer currency
            if (!fxRates[offerCurrency]) {
                console.error(`No FX rate found for ${offerCurrency}. Skipping conversion.`);
                offer.offers[0].price.total = 'N/A';
                offer.offers[0].price.currency = formCurrency; // Update currency even if conversion fails
                return offer;
            }

            const rate = fxRates[offerCurrency]; // Get the FX rate for the offer currency
            console.log('Rate for ', offerCurrency, rate);

            // Convert price: Divide by FX rate (e.g., GBP to NOK)
            const convertedPrice = (parseFloat(offer.offers[0].price.total) / rate).toFixed(2);
            offer.offers[0].price.total = convertedPrice;
            offer.offers[0].price.currency = formCurrency; // Update currency to formCurrency (e.g., NOK)

            return offer;
        });
    }

    /**
     * Formats a hotel name to Title Case.
     * @param {string} hotelName - The hotel name.
     * @returns {string} - Formatted hotel name.
     */
    function formatHotelName(hotelName) {
        if (typeof hotelName !== 'string') return 'N/A';
        return hotelName
            .replace(/_/g, ' ')
            .replace(/,/g, '')
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    /**
     * Formats a room type to Title Case.
     * @param {string} roomType - The room type.
     * @returns {string} - Formatted room type.
     */
    function formatRoomType(roomType) {
        if (typeof roomType !== 'string') return 'N/A';
        return roomType
            .replace(/_/g, ' ')
            .replace(/,/g, '')
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    /**
     * Calculates the distance between two geographic coordinates using the Haversine formula.
     * @param {number} lat1 - Latitude of the first point.
     * @param {number} lon1 - Longitude of the first point.
     * @param {number} lat2 - Latitude of the second point.
     * @param {number} lon2 - Longitude of the second point.
     * @returns {string} - Distance in kilometers, fixed to two decimals.
     */
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat1 * (Math.PI / 180)) *
                  Math.cos(lat2 * (Math.PI / 180)) *
                  Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        return distance.toFixed(2);
    }

    // ------- SUBMIT to Sheety BUTTON -------
    $('#submitToSheet').off('click').on('click', async function() {
        console.log('Submitting data to SHEETY');

        // Validate that at least one hotel is selected
        if (selectedHotels.length === 0) {
            alert('Please select at least one hotel before submitting.');
            return; // Exit if no hotels are selected
        }

        // Show the loader before starting the submission
        $('.loader').show();

        const formData = {
            destination,
            checkInDate,
            checkOutDate,
            adults,
            numberOfRooms,
            email,
            formCurrency
        };

        const formattedData = {
            selectedHotels
        };

        try {
            // Submit to Sheety
            console.log('Submitting to Sheety...');
            const sheetyResult = await submitToSheety(formData, formattedData);

            // Check for confirmation by verifying the presence of "id" in the response
            if (sheetyResult && sheetyResult.id) {
                console.log('Data successfully submitted to Sheety:', sheetyResult);
            } else {
                console.warn('Data submitted to Sheety but did not receive a success confirmation:', sheetyResult);
            }

            // Send email via the backend
            console.log('Sending confirmation email...');
            await sendEmail(destination, checkInDate, checkOutDate, adults, numberOfRooms, email, formCurrency, formattedData.selectedHotels);

            // Show modal to ask if the user wants to track flights
            console.log('Displaying flight tracking modal...');
            askForFlightTracking();

            // Event listener for "Yes" button in the modal to confirm flight tracking
            $('#confirmFlightTracker').off('click').on('click', function() {
                console.log("User opted to track flights.");
                window.location.href = 'https://www.robotize.no/flights';
            });

            // Event listener for "No" button in the modal
            $('.btn-secondary').off('click').on('click', function() {
                console.log("User declined flight tracking.");
                window.location.reload(); // Reload the page after submission
            });

        } catch (error) {
            console.error('Error during data submission:', error.message);
            alert('An error occurred during submission. Please try again later.');
        } finally {
            // Hide the loading icon after the submission completes
            $('.loader').hide();
        }
    });

});
