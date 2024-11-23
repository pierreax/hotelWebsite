$(document).ready(function() {

    const resultsContainer = $('#resultsBox'); // Assuming this is where you want to append the results

    // Function to display the flight tracking modal
    function askForFlightTracking() {
        console.log('Displaying flight tracking modal.');
        $('#flightTrackingModal').modal('show');
    }


    // Function to parse query parameters
    function getQueryParams() {
        const params = new URLSearchParams(window.location.search);
        const queryParams = {};
        for (const [key, value] of params.entries()) {
            queryParams[key] = value;
        }
        return queryParams;
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


    // Currencies and City based on IP-location
    $.get('https://api.ipgeolocation.io/ipgeo?apiKey=420e90eecc6c4bb285f238f38aea898f', function(response) {
        currency = response.currency.code;
        console.log('Setting currency to:',currency);
        // Update the currency based on the IP-response
        $('#currency').val(currency).trigger('change');
    });

    // Retrieve URL parameters and set them as default values in the form
    const queryParams = getQueryParams();
    if (queryParams.email) {
        $('#email').val(queryParams.email);
    }
    if (queryParams.currency) {
        $('#currency').val(queryParams.currency).trigger('change');
    }
    if (queryParams.city) {
        $('#location').val(queryParams.city);
    }

    // Check for dateFrom and dateTo in the URL and set them in Flatpickr
    if (queryParams.dateFrom && queryParams.dateTo) {
        const dateFrom = queryParams.dateFrom;
        const dateTo = queryParams.dateTo;

        // Set Flatpickr dates if both dateFrom and dateTo are available
        datePicker.setDate([dateFrom, dateTo], true, "d/m/Y");
    }

    function formatDateToLocalISOString(date) {
        if (!date) return '';
        const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
        return localDate.toISOString().split('T')[0];
    }


    // SEARCH BUTTON FUNCTIONALITY
    $('#searchForm').on('submit', async function(event) {
        event.preventDefault();
        $('#noResultsMessage').hide();
        $('#submitText').hide();

        // Show the loading icon
        $('.loader').show();

        // Retrieve form data
        const location = $('#location').val();
        const dateRange = datePicker.selectedDates; // Access Flatpickr instance correctly
        const adults = $('#adults').val(); // Will be "2" by default
        const numberOfRooms = $('#numberOfRooms').val(); // Will be "1" by default
        const email = $('#email').val();
        const limitResults = parseInt($('#limitResults').val(), 10);
        const formCurrency = $('#currency').val();

        // Convert selected dates to local format
        const checkInDate = formatDateToLocalISOString(dateRange[0]);
        const checkOutDate = formatDateToLocalISOString(dateRange[1]);
        const numberOfNights = dateRange[1] && dateRange[0] ? Math.round((dateRange[1] - dateRange[0]) / (1000 * 60 * 60 * 24)) : 0;

        // Validate date range
        if (!checkInDate || !checkOutDate || numberOfNights <= 0) {
            alert('Please enter valid check-in and check-out dates.');
            // Focus on the datepicker input field
            $('.datepicker').focus();
            
            $('.loader').hide(); // Hide the loading icon
            return;
        }

        console.log('Form Data:', {
            location,
            checkInDate,
            checkOutDate,
            adults,
            numberOfRooms,
            email,
            formCurrency,
        });

        // API URLs
        const getAccessTokenUrl = '/api/getAccessToken';
        const getHotelsByCoordinatesUrl = '/api/getHotelsByCoordinates';
        const getHotelOffersUrl = '/api/getHotelOffers';
        const getCoordinatesByLocationUrl = '/api/getCoordinatesByLocation';
        const getHotelRatingsUrl = '/api/getHotelRatings';
        const sheetyUrl = '/api/sendDataToSheety';
        const sendEmailUrl = '/api/sendEmail';

        let accessToken;
        let internalHotelIds = [];
        let locationCoordinates;
        let selectedHotels = [];


        // Get FX Rates
        console.log('Getting FX Rates for:',formCurrency);
        const conversionResponse = await fetch(`/api/getFxRates?baseCurrency=${formCurrency}`);
        const conversionData = await conversionResponse.json();

        if (!conversionResponse.ok) {
            console.error('Failed to fetch conversion rates:', conversionData.error);
            return;
        }
        console.log('FX Rates:',conversionData);


        async function getLocationCoordinates(location) {
            const apiUrl = `${getCoordinatesByLocationUrl}?location=${encodeURIComponent(location)}`;
            console.log('API URL:',apiUrl);
            const response = await fetch(apiUrl);
            const text = await response.text();
            try {
                const data = JSON.parse(text);
                locationCoordinates = data;
                return data;
            } catch (err) {
                throw new Error(`Response is not valid JSON: ${text}`);
            }
        }

        async function fetchHotelRatings(validHotelIds) {
            // Ensure that the validHotelIds array is not empty
            if (!Array.isArray(validHotelIds) || validHotelIds.length === 0) {
                throw new Error('No hotel IDs provided.');
            }
        
            // Function to fetch ratings for a chunk of hotel IDs
            async function fetchRatingsForChunk(chunk) {
                // Construct the query parameters
                const params = `hotelIds=${chunk.join(',')}`;
                
                // Construct the full URL with encoded query parameters
                const url = `${getHotelRatingsUrl}&params=${encodeURIComponent(params)}`;
                console.log('Fetching hotel ratings with params:', params);
        
                try {
                    // Make the API request
                    const response = await fetch(url, {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`
                        }
                    });
        
                    // Check if the response status is OK
                    if (!response.ok) {
                        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
                    }
        
                    // Parse the response as text
                    const text = await response.text();
        
                    // Try parsing the response data as JSON
                    try {
                        const responseData = JSON.parse(text);
                        console.log('Hotel ratings response:', responseData);
        
                        // Check for API-specific error structure
                        if (responseData.errors) {
                            const errorDetails = responseData.errors.map(err => `Code: ${err.code}, Detail: ${err.detail}`).join('; ');
                            throw new Error(`Failed to fetch hotel ratings: ${errorDetails}`);
                        }
        
                        return responseData; // Return the parsed data
        
                    } catch (jsonError) {
                        throw new Error(`Failed to parse JSON response: ${text}`);
                    }
        
                } catch (error) {
                    // Log and rethrow the error for further handling
                    console.error('Error fetching hotel ratings:', error.message);
                    throw error; // Re-throwing the error to be handled by the caller
                }
            }
        
            // Function to chunk an array into smaller arrays of a specified size
            function chunkArray(array, size) {
                const result = [];
                for (let i = 0; i < array.length; i += size) {
                    result.push(array.slice(i, i + size));
                }
                return result;
            }
        
            // Create chunks of hotel IDs (max 3 per chunk)
            const chunks = chunkArray(validHotelIds, 3);
        
            // Array to hold all responses
            const allResponses = [];
        
            // Fetch ratings for each chunk and aggregate results
            for (const chunk of chunks) {
                const ratings = await fetchRatingsForChunk(chunk);
                allResponses.push(ratings);
            }
        
            // Aggregate all responses into a single object or array
            const aggregatedResults = allResponses.flatMap(response => response.data || []);
            console.log(aggregatedResults);
            return { data: aggregatedResults };
        }
        
        
        async function fetchHotelOffers(validHotelIds) {
            const limitedHotelIds = validHotelIds.slice(0, limitResults);
            const params = new URLSearchParams({
                hotelIds: limitedHotelIds.join(','),
                adults: adults,
                checkInDate: checkInDate,
                checkOutDate: checkOutDate,
                roomQuantity: numberOfRooms,
                paymentPolicy: 'NONE',
                bestRateOnly: 'true',
                includeClosed: 'false'
            }).toString();
        
            const url = `${getHotelOffersUrl}?${params}`; // Pass query params correctly
            console.log('Fetching hotel offers with params:', params);
        
            try {
                const response = await fetch(url, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                });
        
                const text = await response.text();
                try {
                    const responseData = JSON.parse(text);
                    console.log('Hotel offers response:', responseData);
        
                    if (responseData.message) { // Check for the message
                        resultsContainer.html(`<div class="no-results-message">${responseData.message}</div>`);
                        return; // Exit if there are no valid offers
                    }
        
                    if (responseData.errors) {
                        const errorDetails = responseData.errors.map(err => `Code: ${err.code}, Detail: ${err.detail}`).join('; ');
                        throw new Error(`Failed to fetch hotel offers: ${errorDetails}`);
                    }
        
                    return responseData; // Return valid offers
                } catch (err) {
                    throw new Error(`Failed to parse hotel offers response: ${text}`);
                }
            } catch (err) {
                throw new Error(`Failed to fetch hotel offers: ${err.message}`);
            }
        }
        
        
        // Convert the hotel offers' prices based on the conversion rates received from the backend
        async function convertPricesToFormCurrency(hotelOffers, formCurrency, conversionRates) {
            return hotelOffers.map(offer => {
                // Check if 'offer.offers[0]' and 'offer.offers[0].price' exist before accessing
                if (offer.offers && offer.offers[0] && offer.offers[0].price) {
                    const originalCurrency = offer.offers[0].price.currency;  // Extract the original currency from the offer
                    const originalPrice = offer.offers[0].price.total; // Total price
        
                    console.log('Original Currency:', originalCurrency);
                    console.log('Form Currency:', formCurrency);
        
                    // If the original currency is different from the form currency, convert the price
                    if (originalCurrency !== formCurrency) {
                        const conversionRate = conversionRates[originalCurrency];
                        if (conversionRate) {
                            const convertedPrice = originalPrice / conversionRate;
                            console.log('Converted Price:', convertedPrice);
                            offer.offers[0].price.total = Math.round(convertedPrice);  // Convert and round the price
                        } else {
                            console.error(`Conversion rate not found for ${originalCurrency}`);
                        }
                    }
                } else {
                    console.error('Missing price data for offer:', offer);
                }
        
                return offer;
            });
        }
        
               

        async function submitToSheety(formData, formattedData) {
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
                const response = await fetch(sheetyUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                // Check for non-JSON responses and handle accordingly
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
            } finally {
                // Hide the loading icon
                $('.loader').hide();
            }
        }

        // Function to handle checkbox change
        function handleCheckboxChange() {
            console.log('Checkbox changed');
        
            // Get all checked checkboxes
            const checkedCheckboxes = $('#resultsBox .card input[type="checkbox"]:checked');
            console.log('Checked checkboxes:', checkedCheckboxes.length);
        
            // Toggle the submit button visibility based on whether any checkboxes are checked
            $('#submitToSheet').toggle(checkedCheckboxes.length > 0);
        
            // Extract and log information from each selected card
            selectedHotels = checkedCheckboxes.map(function() {
                const card = $(this).closest('.card');
                const hotelId = card.find('.hiddenHotelId').text();
                const hotelName = card.find('.hotel-name').text();
                const roomType = card.find('.room-type').text();
                const pricePerNight = card.find('.price-per-night .amount').text();
                const totalPrice = card.find('.total-price .amount').text();
        
                // Log the extracted information
                console.log('Selected Hotel Info:', {
                    hotelId,
                    hotelName,
                    roomType,
                    pricePerNight,
                    totalPrice
                });
        
                // Return the data to be stored in selectedHotels array
                return {
                    hotelId,
                    hotelName,
                    roomType,
                    pricePerNight,
                    totalPrice
                };
            }).get();
        }           

        function formatHotelName(hotelName) {
            if (typeof hotelName !== 'string') return 'N/A';
            return hotelName
                .toUpperCase()
                .replace(/_/g, ' ') // Replace underscores with spaces
                .replace(/,/g, '') // Remove commas
                .toLowerCase()
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
        }
        
        function formatRoomType(roomType) {
            if (typeof roomType !== 'string') return 'N/A';
            return roomType
                .toUpperCase()
                .replace(/_/g, ' ')
                .replace(/,/g, '') // Remove commas
                .toLowerCase()
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
        }

        function calculateDistance(lat1, lon1, lat2, lon2) {
            const R = 6371; // Radius of the Earth in km
            const dLat = (lat2 - lat1) * (Math.PI / 180);
            const dLon = (lon2 - lon1) * (Math.PI / 180);
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
                      Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distance = R * c;
            return distance.toFixed(2); // Distance in km
        }
        

        // SUBMIT BUTTON, TO SHEETY AND SEND EMAIL FUNCTIONALITY
        $('#submitToSheet').off('click').on('click', async function() {
            console.log('Submitting data to SHEETY');
            
            // Show the loader before starting the submission
            $('.loader').show();
            
            const formData = {
                location,
                checkInDate,
                checkOutDate,
                adults,
                numberOfRooms,
                email,
                currency: formCurrency,
            };
            
            const formattedData = {
                selectedHotels
            };
            
            try {
                // Submit to Sheety
                const sheetyResult = await submitToSheety(formData, formattedData);
                
                // Check for confirmation by verifying the presence of "id" in the response
                if (sheetyResult && sheetyResult.price && sheetyResult.price.id) {
                    console.log('Data successfully submitted to Sheety:', sheetyResult);
                } else {
                    console.warn('Data submitted to Sheety but did not receive a success confirmation:', sheetyResult);
                }
            
                // Show modal to ask if the user wants to track flights
                askForFlightTracking();
                
                // Event listener for "Yes" button in the modal to confirm flight tracking
                $('#confirmFlightTracker').on('click', function() {
                    console.log("User opted to track flights.");
                    const redirectUrl = 'https://www.robotize.no/flights';
                    window.location.href = redirectUrl;
                });
            
                // Optional: Handle "No" button in the modal
                $('.btn-secondary').on('click', function() {
                    console.log("User declined flight tracking.");
                    // Reset form
                    //window.location.reload(); 
                });

            
                // Attempt to send email via your backend (index.js)
                try {
                    const emailResponse = await fetch(sendEmailUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            subject: "New submission for your Hotel Robot",
                            body: `Great news, somebody just signed up for your Hotel Robot! Here are the details:<br><br>
                                Location: ${location}<br>
                                Check-In Date: ${checkInDate}<br>
                                Check-Out Date: ${checkOutDate}<br>
                                Adults: ${adults}<br>
                                Number of Rooms: ${numberOfRooms}<br>
                                Email: ${email}<br>
                                Currency: ${formCurrency}<br>
                                Selected Hotels:<br>
                                ${formattedData.selectedHotels.length > 0 
                                    ? formattedData.selectedHotels.map(hotel => 
                                        `- ${hotel.hotelName}<br>`).join('') 
                                    : 'No hotels selected'}<br><br>
                                Thank you!`,
                            recipient_email: email
                        })
                    });
                
                    if (!emailResponse.ok) {
                        const errorData = await emailResponse.json();  // Get the error message from the backend
                        console.error('Failed to send email:', errorData.message);
                    } else {
                        console.log('Email sent successfully');
                        // Optionally, notify the user that the email was sent successfully
                    }
                } catch (emailError) {
                    console.error('Error during email sending:', emailError.message);
                }                
            } catch (error) {
                console.error('Error during form submission:', error.message);
            } finally {
                // Hide the loading icon after the submission completes
                $('.loader').hide();
            }
        });
        
        function toggleCheckbox(event) {
            event.stopPropagation(); // Prevents the click event from bubbling up
            const checkbox = $(this).find('input[type="checkbox"]');
            checkbox.prop('checked', !checkbox.prop('checked')).trigger('change'); // Toggle checkbox state and trigger change
            handleCheckboxChange();
        }
        

        // Attach event listener to the checkbox-container
        $('#resultsBox').on('click', '.checkbox-container', toggleCheckbox);

        // Attach event listener to all existing checkboxes
        $('#resultsBox').on('click', '.select-checkbox', toggleCheckbox);


        try {
            const tokenResponse = await fetch(getAccessTokenUrl);
            const tokenData = await tokenResponse.json();
            accessToken = tokenData.access_token;
        
            console.log('Getting coordinates for location:',location);
            const coords = await getLocationCoordinates(location);
            console.log(coords);
            if (!coords || !coords.lat || !coords.lng) {
                $('#noResultsMessage').show();
                throw new Error('Invalid coordinates received');
            }
            const { lat, lng } = coords;
            console.log(lat, lng);
            const getHotelsByCoordinatesUrlWithParams = `${getHotelsByCoordinatesUrl}?lat=${lat}&lng=${lng}&radius=10&radiusUnit=KM&hotelSource=ALL`;
        
            const hotelsResponse = await fetch(getHotelsByCoordinatesUrlWithParams, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            const hotelsData = await hotelsResponse.json();
            console.log('Hotels in the area:', hotelsData);
        
            const resultsContainer = $('#resultsBox'); // Use the results box to hold the cards
            resultsContainer.empty();
        
            if (hotelsData && hotelsData.data && hotelsData.data.length > 0) {
                internalHotelIds = hotelsData.data.map(hotel => hotel.hotelId);
                const hotelIds = internalHotelIds.slice(0, limitResults);
        
                const offersData = await fetchHotelOffers(hotelIds);
                
                // const ratingsData = await fetchHotelRatings(hotelIds); - Skip Hotel ratings for now
        
                // Map ratings data by hotelId for quick lookup
                //const ratingsMap = {};
                //ratingsData.data.forEach(rating => {
                //    ratingsMap[rating.hotelId] = rating.overallRating;
                //});
                
                const convertedOffers = await convertPricesToFormCurrency(offersData.data, formCurrency, conversionData);
                console.log('Converted Offers:',convertedOffers);
        
                // Calculate and add distance to each offer

                const offersWithDistance = convertedOffers.map(offer => {
                    const distance = calculateDistance(
                        coords.lat,
                        coords.lng,
                        offer.hotel.latitude,
                        offer.hotel.longitude
                    );
                    return {
                        ...offer,
                        distance: parseFloat(distance)
                    };
                });
                console.log('Converted Offers with distance:',offersWithDistance);


        
                // Sort offers by distance
                offersWithDistance.sort((a, b) => a.distance - b.distance);
        
                if (offersWithDistance.length > 0) {
                    // Delay between showing cards
                    const delayBetweenCards = 300; // 300 ms delay
                    offersWithDistance.forEach((offer, index) => {
                        setTimeout(() => {
                            const totalPrice = Math.round(parseFloat(offer.offers[0].price.total)); // Total price for the stay
                            const pricePerNight = numberOfNights > 0 ? Math.round((totalPrice / numberOfNights).toFixed(2)) : 'N/A'; // Price per night

                            const card = $('<div>').addClass('card');

                            // Add hotelId in a hidden element
                            const hiddenHotelId = $('<div>').addClass('hiddenHotelId').text(offer.hotel.hotelId).hide();
                            card.append(hiddenHotelId);

                            // Card Header with hotel name
                            const cardHeader = $('<div>').addClass('card-header');
                            cardHeader.append($('<div>').text(formatHotelName(offer.hotel.name)).addClass('hotel-name'));

                            // Add room type below hotel name
                            const roomType = $('<div>').text(offer.offers[0].room ? formatRoomType(offer.offers[0].room.typeEstimated.category) : 'N/A').addClass('room-type');
                            cardHeader.append(roomType);

                            // Add the distance in a separate container
                            const distanceContainer = $('<div>').addClass('distance').text(`${offer.distance.toFixed(2)} km`);
                            card.append(distanceContainer);

                            // Add Rating if available
                            //const rating = ratingsMap[offer.hotel.hotelId];
                            //if (rating) {
                            //    const ratingDiv = $('<div>').addClass('rating');
                                //ratingDiv.append($('<span>').addClass('label').text('Rating: '));
                                //ratingDiv.append($('<span>').addClass('rating-value').text(rating)); // Append the rating
                                //card.append(ratingDiv);
                            //}

                            // Create a container for the checkbox and its label
                            const checkboxContainer = $('<div>').addClass('checkbox-container');

                            // Add the descriptive text
                            checkboxContainer.append($('<span>').addClass('checkbox-description').text('Add to Robot: '));

                            // Add the checkbox
                            checkboxContainer.append($('<input>').attr('type', 'checkbox').addClass('select-checkbox'));

                            // Add the container to the card content
                            card.append(checkboxContainer);

                            // Create a single .card-content div for all other information
                            const cardContent = $('<div>').addClass('card-content');

                            // Get the currency from the form
                            const currencySymbol = $('#currency').val(); // No need to convert to uppercase

                            // Add price per night
                            const pricePerNightDiv = $('<div>').addClass('price-per-night');
                            pricePerNightDiv.append($('<span>').addClass('label').text('Per Night: '));
                            pricePerNightDiv.append($('<span>').addClass('amount').text(`${currencySymbol} ${pricePerNight}`)); // Append currency and pricePerNight
                            cardContent.append(pricePerNightDiv);

                            // Add total price
                            const totalPriceDiv = $('<div>').addClass('total-price');
                            totalPriceDiv.append($('<span>').addClass('label').text('Total: '));
                            totalPriceDiv.append($('<span>').addClass('amount').text(`${currencySymbol} ${totalPrice}`)); // Append currency and totalPrice
                            cardContent.append(totalPriceDiv);

                            // Append the header and content to the card
                            card.append(cardHeader);
                            card.append(cardContent);

                            // Append the card to the results container
                            resultsContainer.append(card);
                        }, delayBetweenCards * index); // Delay each card by the specified amount multiplied by its index
                    });
                } else {
                    // Show a simple message if no valid offers are found
                    console.log('No offers found, showing message to the user.');
                    resultsContainer.html('<div class="no-results-message">No valid hotel offers found. Please try different search criteria.</div>');
                }

        
                $('#resultsBox').show();
                $('#submitText').show();
            } else {
                $('#noResultsMessage').show();
            }
        } catch (error) {
            console.error('Error:', error.message);
            $('#resultsBox').show();
            $('#noResultsMessage').show();
        } finally {
            $('.loader').hide();
        }
        
    });
});