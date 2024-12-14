$(document).ready(function () {
    // Constants and Selectors
    const SELECTORS = {
        resultsContainer: $('#resultsBox'),
        flightTrackingModal: $('#flightTrackingModal'),
        currencyInput: $('#currency'),
        emailInput: $('#email'),
        locationInput: $('#location'),
        searchForm: $('#searchForm'),
        loader: $('.loader'),
        noResultsMessage: $('#noResultsMessage'),
        submitText: $('#submitText'),
        submitToSheetBtn: $('#submitToSheet'),
        datePickerInput: $('.datepicker'),
        confirmFlightTrackerBtn: $('#confirmFlightTracker'),
        btnSecondary: $('.btn-secondary'),
        thankYouOkBtn: $('#closeThankYouModal'),
    };

    // API Endpoints
    const API_ENDPOINTS = {
        ipGeo: 'https://api.ipgeolocation.io/ipgeo?apiKey=420e90eecc6c4bb285f238f38aea898f',
        getAccessToken: '/api/getAccessToken',
        getHotelsByCoordinates: '/api/getHotelsByCoordinates',
        getHotelOffers: '/api/getHotelOffers',
        getCoordinatesByLocation: '/api/getCoordinatesByLocation',
        getHotelRatings: '/api/getHotelRatings',
        sheety: '/api/sendDataToSheety',
        sendEmail: '/api/sendEmail',
        getFxRates: '/api/getFxRates',
    };

    // Global Variables
    let accessToken = '';
    let internalHotelIds = [];
    let selectedHotels = [];
    let locationCoordinates = {};
    let conversionRates = {};
    let datePicker;
    let redirectUrl = '';
    let redirectEmail = '';
    let redirectCity = '';
    let redirectCurrency = '';
    let redirectDateFrom = '';
    let redirectDateTo = '';
    let redirected = false;  // Global variable to track if the user has been redirected
    let initialCurrency = ''; 


    // Function to send iframe height to parent
    const scrollToTop = () => {
        // Send a message to request scrolling to top
        window.parent.postMessage({ action: 'scrollToTop' }, "https://www.robotize.no");
        console.log('Sending Scroll to Top to Wix');
    };


    /**
     * Capture redirect parameters after form submission.
     */
    const captureRedirectParameters = () => {
        redirectEmail = encodeURIComponent(SELECTORS.emailInput.val());
        redirectCurrency = encodeURIComponent(SELECTORS.currencyInput.val());
        redirectDateFrom = formatDateToLocalISOString(datePicker.selectedDates[0]);
        redirectDateTo = formatDateToLocalISOString(datePicker.selectedDates[1]);
        redirectUrl = `https://www.robotize.no/flights?email=${redirectEmail}&currency=${redirectCurrency}&city=${redirectCity}&dateFrom=${redirectDateFrom}&dateTo=${redirectDateTo}`;
        console.log('Redirect URL:', redirectUrl);
    };


    /**
     * Initialize the Flatpickr date range picker.
     */
    const initializeDatePicker = () => {
        return flatpickr(SELECTORS.datePickerInput, {
            mode: "range",
            dateFormat: "j M Y",
            altInput: true,
            altFormat: "j M Y",
            minDate: 'today',
            locale: {
                firstDayOfWeek: 1
            },
            onChange: function (selectedDates, dateStr, instance) {
                instance.element.dispatchEvent(new Event('input'));
            }
        });
    };

    /**
     * Display the flight tracking modal.
     */
    const showFlightTrackingModal = () => {
        console.log('Displaying flight tracking modal.');
        
        // Show the modal
        SELECTORS.flightTrackingModal.modal('show');
        
        // Add modal-open class to body to prevent scrolling
        document.body.classList.add('modal-open');
    };

    // Function to show the thank you modal
    const showThankYouModal = () => {
        console.log('Displaying thank you modal.');
        $('#thankYouModal').modal('show');
    };


    /**
     * Parse query parameters from the URL and set the `redirected` flag if parameters exist.
     * @returns {Object} Query parameters as key-value pairs.
     */
    const getQueryParams = () => {
        const params = new URLSearchParams(window.location.search);
        const queryParams = {};
        let redirectedFlag = false;  // Initialize the redirected flag

        for (const [key, value] of params.entries()) {
            queryParams[key] = value;
        }

        // Check if the query params contain any relevant redirection data, excluding 'city'
        if (Object.keys(queryParams).length > 0) {
            if (queryParams.dateFrom || queryParams.dateTo || queryParams.email) {
                redirectedFlag = true;  // Set redirected to true if any relevant param exists
                console.log('User has been redirected');
            }
        }

        // Only set the redirected flag if there's a relevant parameter
        if (redirectedFlag) {
            redirected = true;
        }

        return queryParams;
    };


    /**
     * Format a Date object to a local ISO string (YYYY-MM-DD).
     * @param {Date} date 
     * @returns {string} Formatted date string.
     */
    const formatDateToLocalISOString = (date) => {
        if (!date) return '';
        const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
        return localDate.toISOString().split('T')[0];
    };

    /**
     * Fetch JSON data with error handling.
     * @param {string} url 
     * @param {Object} options 
     * @returns {Object} Parsed JSON data.
     */
    const fetchJSON = async (url, options = {}) => {
        const response = await fetch(url, options);
        const text = await response.text();
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}: ${text}`);
        }
        try {
            return JSON.parse(text);
        } catch (err) {
            throw new Error(`Failed to parse JSON response: ${text}`);
        }
    };

    /**
     * Initialize form fields with query parameters.
     * @param {Object} queryParams 
     */
    const initializeFormFields = (queryParams) => {
        if (queryParams.email) {
            SELECTORS.emailInput.val(queryParams.email);
        }
        if (queryParams.currency) {
            SELECTORS.currencyInput.val(queryParams.currency).trigger('change');
        }
        if (queryParams.city) {
            SELECTORS.locationInput.val(queryParams.city);
        }
        if (queryParams.dateFrom && queryParams.dateTo) {
            datePicker.setDate([queryParams.dateFrom, queryParams.dateTo], true, "d/m/Y");
        }
    };

    /**
     * Set currency based on IP geolocation.
     * @returns {Promise} A Promise that resolves when the currency is set.
     */
    const setCurrencyFromIP = () => {
        return new Promise((resolve, reject) => {
            $.get(API_ENDPOINTS.ipGeo, function (response) {
                const currency = response.currency.code;
                console.log('Setting currency to:', currency);
                SELECTORS.currencyInput.val(currency).trigger('change');
                resolve();  // Resolve the Promise once the currency is set
            }).fail((error) => {
                reject(error);  // Reject the Promise if the request fails
            });
        });
    };



    // Initialize form field listeners
    const initLocationInputListener = () => {
        // Listen for the blur event when the user finishes typing and moves focus out of the location input
        SELECTORS.locationInput.on('blur', async (event) => {
            const location = event.target.value;

            // Only trigger fetch if the location input is not empty
            if (location.trim()) {
                try {
                    // Fetch Coordinates and City Information as soon as location is entered
                    console.log('Getting coordinates for location:', location);

                    // Fetch the location data from the API
                    const locationData = await fetchJSON(`${API_ENDPOINTS.getCoordinatesByLocation}?location=${encodeURIComponent(location)}`);
                    console.log('Location data:', locationData);

                    if (locationData && locationData.results.length > 0) {
                        // Extract coordinates from the API response
                        locationCoordinates = locationData.results[0].geometry.location;
                        console.log('Coordinates:', locationCoordinates);

                        // Extract city from the address components (looking for either 'locality' or 'postal_town')
                        const cityComponent = locationData.results[0].address_components.find(component => 
                            component.types.includes('locality') || component.types.includes('postal_town')
                        );

                        // Assign city value to global variable
                        redirectCity = cityComponent ? cityComponent.long_name : '';
                        console.log('City:', redirectCity);

                        // Fetch Hotels by Coordinates
                        const { lat, lng } = locationCoordinates;
                        const hotelsParams = new URLSearchParams({
                            lat,
                            lng,
                            radius: 100,
                            radiusUnit: 'KM',
                            hotelSource: 'ALL'
                        }).toString();
                        const hotelsUrl = `${API_ENDPOINTS.getHotelsByCoordinates}?${hotelsParams}`;
                        const hotelsData = await fetchJSON(hotelsUrl, {
                            headers: { 'Authorization': `Bearer ${accessToken}` }
                        });
                        console.log('Hotels in the area:', hotelsData);

                        // Optionally, you could start showing the hotels immediately here instead of waiting for the submit button
                        // Render hotels as they are available
                        renderHotelCards(hotelsData.data, formData, numberOfNights);  // Call your render function here

                    } else {
                        console.log('Location not found');
                    }
                } catch (error) {
                    console.error('Error fetching location data:', error);
                }
            }
        });
    };

    // Initialize location input listener
    initLocationInputListener();



    /**
     * Handle form submission for searching hotels.
     * @param {Event} event 
     */
    const handleSearchFormSubmit = async (event) => {
        event.preventDefault();
        SELECTORS.noResultsMessage.hide();
        SELECTORS.submitText.hide();
        SELECTORS.loader.show();

        // Retrieve form data
        const formData = {
            location: SELECTORS.locationInput.val(),
            dateRange: datePicker.selectedDates,
            adults: $('#adults').val(),
            numberOfRooms: $('#numberOfRooms').val(),
            email: SELECTORS.emailInput.val(),
            limitResults: parseInt($('#limitResults').val(), 20), // Limit results for Hotel Offers (currently hidden)
            formCurrency: SELECTORS.currencyInput.val(),
        };

        // Convert selected dates to local format
        const checkInDate = formatDateToLocalISOString(formData.dateRange[0]);
        const checkOutDate = formatDateToLocalISOString(formData.dateRange[1]);
        const numberOfNights = formData.dateRange[1] && formData.dateRange[0]
            ? Math.round((formData.dateRange[1] - formData.dateRange[0]) / (1000 * 60 * 60 * 24))
            : 0;

        // Validate date range
        if (!checkInDate || !checkOutDate || numberOfNights <= 0) {
            alert('Please enter valid check-in and check-out dates.');
            SELECTORS.datePickerInput.focus();
            SELECTORS.loader.hide();
            return;
        }

        console.log('Form Data:', {
            location: formData.location,
            checkInDate,
            checkOutDate,
            adults: formData.adults,
            numberOfRooms: formData.numberOfRooms,
            email: formData.email,
            formCurrency: formData.formCurrency,
        });

        try {

            // Fetch FX Rates only if the currency has changed
            if (formData.formCurrency !== initialCurrency) {
                console.log('Getting FX Rates for:', formData.formCurrency);
                const fxRatesData = await fetchJSON(`${API_ENDPOINTS.getFxRates}?baseCurrency=${formData.formCurrency}`);
                conversionRates = fxRatesData;
                initialCurrency = formData.formCurrency;  // Update the stored currency after fetching FX rates
            }

            // Fetch Access Token
            const tokenData = await fetchJSON(API_ENDPOINTS.getAccessToken);
            accessToken = tokenData.access_token;

            // Get Location Coordinates and City
            console.log('Getting coordinates for location:', formData.location);

            // Fetch the location data from the API
            const locationData = await fetchJSON(`${API_ENDPOINTS.getCoordinatesByLocation}?location=${encodeURIComponent(formData.location)}`);
            console.log('Location data:', locationData);

            // Extract coordinates from the API response
            locationCoordinates = locationData.results[0].geometry.location;
            console.log('Coordinates:', locationCoordinates);

            // Extract city from the address components (looking for either 'locality' or 'postal_town')
            const cityComponent = locationData.results[0].address_components.find(component => 
                component.types.includes('locality') || component.types.includes('postal_town')
            );

            // Check if city was found before assigning it to the global variable
            if (cityComponent) {
                redirectCity = cityComponent.long_name;  // Assign city value to global variable
                console.log('City:', redirectCity);
            } else {
                console.log('City not found');
                redirectCity = '';  // Optional: Set to empty or any default value you want
            }

            // Store the coordinates
            const { lat, lng } = locationCoordinates;
            console.log('Latitude:', lat, 'Longitude:', lng);

            // Fetch Hotels by Coordinates
            const hotelsParams = new URLSearchParams({
                lat,
                lng,
                radius: 100,
                radiusUnit: 'KM',
                hotelSource: 'ALL'
            }).toString();
            const hotelsUrl = `${API_ENDPOINTS.getHotelsByCoordinates}?${hotelsParams}`;
            const hotelsData = await fetchJSON(hotelsUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            console.log('Hotels in the area:', hotelsData);

            // Process Hotels Data
            SELECTORS.resultsContainer.empty();

            if (hotelsData && hotelsData.data && hotelsData.data.length > 0) {
                internalHotelIds = hotelsData.data.map(hotel => hotel.hotelId);
                const hotelIds = internalHotelIds.slice(0, formData.limitResults);

                // Fetch Hotel Offers
                const offersData = await fetchHotelOffers(hotelIds, formData, checkInDate, checkOutDate, numberOfNights);
                if (!offersData) return; // If no offers, exit early

                // Convert Prices
                const convertedOffers = await convertPricesToFormCurrency(offersData.data, formData.formCurrency, conversionRates);
                console.log('Converted Offers:', convertedOffers);

                // Calculate Distances
                const offersWithDistance = calculateDistances(convertedOffers, locationCoordinates);
                console.log('Converted Offers with distance:', offersWithDistance);

                // Sort Offers by Distance
                offersWithDistance.sort((a, b) => a.distance - b.distance);
                console.log('Sorted and Converted Offers with distance:', offersWithDistance);

                // Render Hotel Cards
                renderHotelCards(offersWithDistance, formData, numberOfNights);

            } else {
                SELECTORS.noResultsMessage.show();
            }
        } catch (error) {
            console.error('Error:', error.message);
            SELECTORS.resultsContainer.show();
            SELECTORS.noResultsMessage.show();
        } finally {
            SELECTORS.loader.hide();
        }
    };

    /**
     * Fetch hotel offers based on hotel IDs and form data.
     * @param {Array} hotelIds 
     * @param {Object} formData 
     * @param {string} checkInDate 
     * @param {string} checkOutDate 
     * @returns {Object|null} Offers data or null if no offers.
     */
    const fetchHotelOffers = async (hotelIds, formData, checkInDate, checkOutDate) => {
        const params = new URLSearchParams({
            hotelIds: hotelIds.join(','),
            adults: formData.adults,
            checkInDate,
            checkOutDate,
            roomQuantity: formData.numberOfRooms,
            paymentPolicy: 'NONE',
            bestRateOnly: 'true',
            includeClosed: 'false'
        }).toString();

        const url = `${API_ENDPOINTS.getHotelOffers}?${params}`;
        console.log('Fetching hotel offers with params:', params);

        try {
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            const responseData = await response.json();
            console.log('Hotel offers response:', responseData);

            if (responseData.message) {
                SELECTORS.resultsContainer.html(`<div class="no-results-message">${responseData.message}</div>`);
                return null;
            }

            if (responseData.errors) {
                const errorDetails = responseData.errors.map(err => `Code: ${err.code}, Detail: ${err.detail}`).join('; ');
                throw new Error(`Failed to fetch hotel offers: ${errorDetails}`);
            }

            return responseData;
        } catch (err) {
            console.error(`Failed to fetch hotel offers: ${err.message}`);
            throw err;
        }
    };

    /**
     * Convert hotel offer prices to the form's currency using conversion rates.
     * @param {Array} hotelOffers 
     * @param {string} formCurrency 
     * @param {Object} conversionRates 
     * @returns {Array} Converted hotel offers.
     */
    const convertPricesToFormCurrency = async (hotelOffers, formCurrency, conversionRates) => {
        return hotelOffers.map(offer => {
            const priceData = offer.offers?.[0]?.price;
            if (priceData) {
                const originalCurrency = priceData.currency;
                const originalPrice = priceData.total;

                if (originalCurrency !== formCurrency) {
                    const rate = conversionRates[originalCurrency];
                    if (rate) {
                        const convertedPrice = originalPrice / rate;
                        offer.offers[0].price.total = Math.round(convertedPrice);
                    } else {
                        console.error(`Conversion rate not found for ${originalCurrency}`);
                    }
                }
            } else {
                console.error('Missing price data for offer:', offer);
            }
            return offer;
        });
    };

    /**
     * Calculate the distance between two geographic coordinates.
     * @param {number} lat1 
     * @param {number} lon1 
     * @param {number} lat2 
     * @param {number} lon2 
     * @returns {Object} Distance in numeric and display formats.
     */
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371; // Radius of the Earth in km
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distanceKm = R * c;

        if (distanceKm < 1) {
            return { numeric: distanceKm * 1000, display: `${(distanceKm * 1000).toFixed(0)} m` };
        } else {
            return { numeric: distanceKm, display: `${distanceKm.toFixed(2)} km` };
        }
    };

    /**
     * Calculate distances for all hotel offers relative to the user's location.
     * @param {Array} offers 
     * @param {Object} userCoords 
     * @returns {Array} Offers with distance information.
     */
    const calculateDistances = (offers, userCoords) => {
        return offers.map(offer => {
            const hotelCoords = offer.hotel;
            const distanceInfo = calculateDistance(
                userCoords.lat,
                userCoords.lng,
                hotelCoords.latitude,
                hotelCoords.longitude
            );
            return {
                ...offer,
                distance: distanceInfo.numeric,
                distanceDisplay: distanceInfo.display
            };
        });
    };

    /**
     * Render hotel offer cards to the results container.
     * @param {Array} offers 
     * @param {Object} formData 
     * @param {number} numberOfNights 
     */
    const renderHotelCards = (offers, formData, numberOfNights) => {
        if (offers.length === 0) {
            console.log('No offers found, showing message to the user.');
            SELECTORS.resultsContainer.html('<div class="no-results-message">No valid hotel offers found. Please try different search criteria.</div>');
            return;
        }
    
        offers.forEach((offer) => {
            const totalPrice = Math.round(parseFloat(offer.offers[0].price.total));
            const pricePerNight = numberOfNights > 0
                ? Math.round((totalPrice / numberOfNights).toFixed(2))
                : 'N/A';
            const currencySymbol = formData.formCurrency;
    
            const card = $('<div>').addClass('card');
    
            // Hidden Hotel ID
            $('<div>')
                .addClass('hiddenHotelId')
                .text(offer.hotel.hotelId)
                .hide()
                .appendTo(card);
    
            // Card Header
            const cardHeader = $('<div>').addClass('card-header');
            $('<div>')
                .addClass('hotel-name')
                .text(formatHotelName(offer.hotel.name))
                .appendTo(cardHeader);
    
            // Room type - Only append if available
            if (offer.offers[0].room && offer.offers[0].room.typeEstimated && offer.offers[0].room.typeEstimated.category) {
                const roomType = formatRoomType(offer.offers[0].room.typeEstimated.category);
                $('<div>')
                    .addClass('room-type')
                    .text(roomType)
                    .appendTo(cardHeader);
            }
            
            card.append(cardHeader);
    
            // Distance Display
            $('<div>')
                .addClass('distance')
                .text(offer.distanceDisplay)
                .appendTo(card);
    
            // Checkbox Container
            const checkboxContainer = $('<div>').addClass('checkbox-container');
            checkboxContainer.append($('<span>').addClass('checkbox-description').text('Add to Robot: '));
            checkboxContainer.append($('<input>').attr('type', 'checkbox').addClass('select-checkbox'));
            card.append(checkboxContainer);
    
            // Card Content
            const cardContent = $('<div>').addClass('card-content');
            $('<div>').addClass('price-per-night')
                .append($('<span>').addClass('label').text('Per Night: '))
                .append($('<span>').addClass('amount').text(`${currencySymbol} ${pricePerNight}`))
                .appendTo(cardContent);
            $('<div>').addClass('total-price')
                .append($('<span>').addClass('label').text('Total: '))
                .append($('<span>').addClass('amount').text(`${currencySymbol} ${totalPrice}`))
                .appendTo(cardContent);
            card.append(cardContent);
    
            // Append Card to Results
            SELECTORS.resultsContainer.append(card);
        });
    
        SELECTORS.resultsContainer.show();
        SELECTORS.submitText.show();
    };
    
    
    
    

    /**
     * Format hotel name for display.
     * @param {string} hotelName 
     * @returns {string} Formatted hotel name.
     */
    const formatHotelName = (hotelName) => {
        if (typeof hotelName !== 'string') return 'N/A';
        return hotelName
            .toUpperCase()
            .replace(/_/g, ' ')
            .replace(/,/g, '')
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    /**
     * Format room type for display.
     * @param {string} roomType 
     * @returns {string} Formatted room type.
     */
    const formatRoomType = (roomType) => {
        if (typeof roomType !== 'string') return 'N/A';
        return roomType
            .toUpperCase()
            .replace(/_/g, ' ')
            .replace(/,/g, '')
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    /**
     * Handle checkbox state changes and update selected hotels.
     */
    const handleCheckboxChange = () => {
        console.log('Checkbox changed');

        const checkedCheckboxes = SELECTORS.resultsContainer.find('.card input[type="checkbox"]:checked');
        console.log('Checked checkboxes:', checkedCheckboxes.length);

        SELECTORS.submitToSheetBtn.toggle(checkedCheckboxes.length > 0);

        selectedHotels = checkedCheckboxes.map(function () {
            const card = $(this).closest('.card');
            const hotelId = card.find('.hiddenHotelId').text();
            const hotelName = card.find('.hotel-name').text();
            const roomType = card.find('.room-type').text();
            const pricePerNight = card.find('.price-per-night .amount').text();
            const totalPrice = card.find('.total-price .amount').text();

            console.log('Selected Hotel Info:', {
                hotelId,
                hotelName,
                roomType,
                pricePerNight,
                totalPrice
            });

            return {
                hotelId,
                hotelName,
                roomType,
                pricePerNight,
                totalPrice
            };
        }).get();
    };

    /**
     * Toggle checkbox state when clicking on the container or checkbox.
     * @param {Event} event 
     */
    const toggleCheckbox = function (event) { // Changed to regular function
        event.stopPropagation();
        const checkbox = $(this).find('input[type="checkbox"]');
        if (checkbox.length === 0) {
            // If the click is on the checkbox itself
            const directCheckbox = $(event.target).closest('.select-checkbox');
            if (directCheckbox.length > 0) {
                handleCheckboxChange();
                return;
            }
        }
        checkbox.prop('checked', !checkbox.prop('checked')).trigger('change');
        handleCheckboxChange();
    };

    /**
     * Submit selected hotels to Sheety and send email.
     */
    const handleSubmitToSheety = async () => {
        console.log('Submitting data to SHEETY');
        SELECTORS.loader.show();

        const formData = {
            location: SELECTORS.locationInput.val(),
            checkInDate: formatDateToLocalISOString(datePicker.selectedDates[0]),
            checkOutDate: formatDateToLocalISOString(datePicker.selectedDates[1]),
            adults: $('#adults').val(),
            numberOfRooms: $('#numberOfRooms').val(),
            email: SELECTORS.emailInput.val(),
            currency: SELECTORS.currencyInput.val(),
        };

        const formattedData = {
            selectedHotels
        };

        try {
            // Submit to Sheety
            const sheetyResult = await submitToSheety(formData, formattedData);

            // Confirm Sheety submission
            if (sheetyResult && sheetyResult.price && sheetyResult.price.id) {
                console.log('Data successfully submitted to Sheety:', sheetyResult);
            } else {
                console.warn('Data submitted to Sheety but did not receive a success confirmation:', sheetyResult);
            }

            // Capture redirect parameters
            captureRedirectParameters();


            // Send email notification
            await sendEmailNotification(formData, formattedData);

            // Scroll to top before showing the modal at the top
            scrollToTop();  

            // Initialize the modal based on whether the user has been redirected
            if (redirected) {
                // If user was redirected, show the thank you modal
                showThankYouModal();
            } else {
                // Show flight tracking modal
                showFlightTrackingModal();
            }


            // Handle flight tracking confirmation
            SELECTORS.confirmFlightTrackerBtn.off('click').on('click', function () {
                window.open(redirectUrl, '_blank');    // Navigate to redirect to the other site in a new tab
                window.location.href = 'https://robotize-hotels.azurewebsites.net/';  // Refresh the form page
            });

            // Handle flight tracking decline
            SELECTORS.btnSecondary.off('click').on('click', function () {
                console.log("User declined flight tracking.");
                window.location.href = 'https://robotize-hotels.azurewebsites.net/';  // Refresh the form page
            });

            // Handle OK button in modal
            SELECTORS.thankYouOkBtn.off('click').on('click', function () {
                console.log("User clicked OK on thank you modal.");
                window.location.href = 'https://robotize-hotels.azurewebsites.net/';  // Refresh the form page
            });

            // If the modal is closed, remove the modal-open class from body to restore scrolling
            SELECTORS.flightTrackingModal.on('hidden.bs.modal', function () {
                document.body.classList.remove('modal-open');
            });

        } catch (error) {
            console.error('Error during form submission:', error.message);
        } finally {
            SELECTORS.loader.hide();
        }
    };

    /**
     * Submit form data to Sheety.
     * @param {Object} formData 
     * @param {Object} formattedData 
     * @returns {Object} Sheety response data.
     */
    const submitToSheety = async (formData, formattedData) => {
        const data = {
            location: formData.location,
            checkInDate: formData.checkInDate,
            checkOutDate: formData.checkOutDate,
            adults: formData.adults,
            numberOfRooms: formData.numberOfRooms,
            email: formData.email,
            currency: formData.currency,
            selectedHotels: formattedData.selectedHotels.length > 0 ? formattedData.selectedHotels : [{ message: "No hotels selected" }]
        };

        console.log('Submitting to Sheety with data:', JSON.stringify(data, null, 2));

        try {
            const response = await fetch(API_ENDPOINTS.sheety, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const text = await response.text();
            if (response.ok) {
                console.log('Sheety response:', text);
                return JSON.parse(text);
            } else {
                throw new Error(`HTTP error ${response.status}: ${text}`);
            }
        } catch (error) {
            console.error('Error sending data to Sheety:', error.message);
            throw error;
        }
    };

    /**
     * Send email notification via backend.
     * @param {Object} formData 
     * @param {Object} formattedData 
     */
    const sendEmailNotification = async (formData, formattedData) => {
        try {
            const emailResponse = await fetch(API_ENDPOINTS.sendEmail, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subject: "Welcome to the Hotel Robot",
                    body: `
                        Welcome to the Hotel Robot!<br><br>
                        We will check prices for you daily, and let you know if there is a change.<br><br>
                        Here are your details:<br><br>
                        Location: ${formData.location}<br>
                        Check-In Date: ${formData.checkInDate}<br>
                        Check-Out Date: ${formData.checkOutDate}<br>
                        Adults: ${formData.adults}<br>
                        Number of Rooms: ${formData.numberOfRooms}<br>
                        Email: ${formData.email}<br>
                        Currency: ${formData.currency}<br>
                        Selected Hotels:<br>
                        ${formattedData.selectedHotels.length > 0
                            ? formattedData.selectedHotels.map(hotel => `- ${hotel.hotelName}<br>`).join('')
                            : 'No hotels selected'}<br><br>
                        Thank you!
                    `,
                    recipient_email: formData.email
                })
            });

            if (!emailResponse.ok) {
                const errorData = await emailResponse.json();
                console.error('Failed to send email:', errorData.message);
            } else {
                console.log('Email sent successfully');
                // Optionally notify the user
            }
        } catch (error) {
            console.error('Error during email sending:', error.message);
        }
    };

    /**
     * Attach event listeners.
     */
    const attachEventListeners = () => {
        // Handle search form submission
        SELECTORS.searchForm.on('submit', handleSearchFormSubmit);

        // Handle checkbox interactions
        SELECTORS.resultsContainer.on('click', '.checkbox-container, .select-checkbox', toggleCheckbox);

        // Handle submit to Sheety button
        SELECTORS.submitToSheetBtn.on('click', handleSubmitToSheety);
    };

    /**
    * Initialize the application.
    */
    const init = async () => {
        // Initialize components
        datePicker = initializeDatePicker();

        // Get query parameters
        const queryParams = getQueryParams();

        // Only set currency from IP if 'currency' is not present in query params
        if (!queryParams.currency) {
            await setCurrencyFromIP();  // Wait for currency to be set
        }

        // Initialize form fields
        initializeFormFields(queryParams);

        // Attach event listeners
        attachEventListeners();

        // Fetch FX Rates after currency is set
        const formCurrency = SELECTORS.currencyInput.val(); // Get the currency after it's set
        if (formCurrency) {
            console.log('Getting FX Rates for:', formCurrency);
            conversionRates = await fetchJSON(`${API_ENDPOINTS.getFxRates}?baseCurrency=${formCurrency}`);
        }

        // Store the initial currency after setting or reading from queryParams
        initialCurrency = formCurrency;
    };

    // Initialize the script
    init();
});
