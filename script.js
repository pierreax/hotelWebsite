$(document).ready(function() {
    // Initialize Flatpickr for date range selection
    const datePicker = flatpickr('.datepicker', {
        mode: "range",
        dateFormat: "j M Y", // Format for display (e.g., "24 Jan 2024")
        altInput: true,
        altFormat: "j M Y", // Display format for the user
        minDate: 'today',
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

    $('#searchForm').on('submit', async function(event) {
        event.preventDefault();

        // Show the loading icon
        $('.loader').show();

        // Retrieve form data
        const location = $('#location').val();
        const dateRange = datePicker.selectedDates; // Access Flatpickr instance correctly
        const adults = $('#adults').val();
        const numberOfRooms = $('#numberOfRooms').val();
        const email = $('#email').val();
        const limitResults = parseInt($('#limitResults').val(), 10);
        const formCurrency = $('#currency').val();
        const priceLimit = parseFloat($('#priceLimit').val());

        // Convert selected dates to required format
        const checkInDate = dateRange[0] ? dateRange[0].toISOString().split('T')[0] : '';
        const checkOutDate = dateRange[1] ? dateRange[1].toISOString().split('T')[0] : '';
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
            priceLimit
        });

        // API URLs
        const getAccessTokenUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetAmadeusAccessToken?code=8-Ok9mpy3X22aWVQSXBs_djXz57bJvh23XJAPuY-yH9jAzFu8nDFaA%3D%3D';
        const getHotelsByCoordinatesUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetHotelsByCoordinates?code=_9_S3ATWEtYncsW6pzX2gKatTmRWbkHKc9O2GsD-74BqAzFupvm9kA%3D%3D';
        const getHotelOffersUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetHotelOffers?code=N5p8k9qzS_NgW_h2mHWm_xKOpPHY2Cjb_nh_TCturrA5AzFuCXBy-g%3D%3D';
        const getCoordinatesByLocationUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetCoordinatesByLocation?code=tyHMhU1QpcgHHWUrwfor8PtyYEzW-keeu2daJnRQqdQxAzFuPgYxzA%3D%3D';
        const sheetyUrl = 'https://hotelfunctionapp.azurewebsites.net/api/SendDataToSheety?code=WB185Wd0xWtqP1DMGlKF1WnHLt8TXwpm8QXDzTlulg6FAzFuFvQ-2A%3D%3D';
        const conversionApiUrl = 'https://v6.exchangerate-api.com/v6/0fdee0a5645b6916b5a20bb3/latest/';

        let accessToken;
        let internalHotelIds = [];
        let locationCoordinates;
        let selectedHotels = [];

        async function convertCurrency(amount, fromCurrency, toCurrency) {
            const url = `${conversionApiUrl}${fromCurrency}`;
            const response = await fetch(url);
            const data = await response.json();
            const rate = data.conversion_rates[toCurrency];
            if (!rate) {
                throw new Error(`No conversion rate available for ${toCurrency}`);
            }
            return amount * rate;
        }

        async function getLocationCoordinates(location) {
            const apiUrl = `${getCoordinatesByLocationUrl}&location=${encodeURIComponent(location)}`;
            console.log('Coordinates URL:', apiUrl);
            const response = await fetch(apiUrl);
            const text = await response.text();
            try {
                const data = JSON.parse(text);
                console.log('Coordinates Data:', data);
                locationCoordinates = data;
                return data;
            } catch (err) {
                throw new Error(`Response is not valid JSON: ${text}`);
            }
        }

        async function fetchHotelOffers(validHotelIds) {
            const limitedHotelIds = validHotelIds.slice(0, limitResults);
            const params = `hotelIds=${limitedHotelIds.join(',')}&adults=${adults}&checkInDate=${checkInDate}&checkOutDate=${checkOutDate}&roomQuantity=${numberOfRooms}&paymentPolicy=NONE&bestRateOnly=true&includeClosed=false`;
            const url = `${getHotelOffersUrl}&params=${encodeURIComponent(params)}`;
            console.log('Fetching hotel offers with params:', params);
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            const text = await response.text();
            try {
                const responseData = JSON.parse(text);
                console.log('Hotel offers response:', responseData);
                if (responseData.errors) {
                    const errorDetails = responseData.errors.map(err => `Code: ${err.code}, Detail: ${err.detail}`).join('; ');
                    throw new Error(`Failed to fetch hotel offers: ${errorDetails}`);
                }
                return responseData;
            } catch (err) {
                throw new Error(`Failed to parse hotel offers response: ${text}`);
            }
        }

        async function convertPricesToFormCurrency(hotelOffers, originalCurrency) {
            return Promise.all(hotelOffers.map(async offer => {
                const price = parseFloat(offer.offers[0].price.total);
                if (originalCurrency !== formCurrency) {
                    const convertedPrice = await convertCurrency(price, originalCurrency, formCurrency);
                    offer.offers[0].price.total = convertedPrice.toFixed(2);
                    offer.offers[0].price.currency = formCurrency;
                }
                return offer;
            }));
        }

        function filterOffersByPrice(hotelOffers, priceLimit, numberOfNights) {
            console.log('Filtering offers by price. Price Limit:', priceLimit, 'Number of Nights:', numberOfNights);

            return hotelOffers.map(offer => {
                const totalPrice = parseFloat(offer.offers[0].price.total);
                const pricePerNight = totalPrice / numberOfNights;

                console.log('Offer ID:', offer.hotel.hotelId, 'Total Price:', totalPrice, 'Price Per Night:', pricePerNight);

                return {
                    ...offer,
                    pricePerNight: pricePerNight.toFixed(2)
                };
            }).filter(offer => {
                return parseFloat(offer.pricePerNight) <= priceLimit;
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
                priceLimit: formData.priceLimit,
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

        function handleCheckboxChange() {
            const checkedCheckboxes = $('#results tbody input[type="checkbox"]:checked');
        
            console.log('Checked Checkboxes Count:', checkedCheckboxes.length);
        
            if (checkedCheckboxes.length > 0) {
                $('#submitToSheet').show();
                selectedHotels = checkedCheckboxes.map(function() {
                    const row = $(this).closest('tr');
                    const hotelData = {
                        hotelId: row.find('.hiddenHotelId').text(),
                        hotelName: row.find('.hotel').text(),
                        roomType: row.find('.roomType').text(),
                        pricePerNight: row.find('.pricePerNight').text(),
                        price: row.find('.price').text(),
                    };
                    
                    // Log each hotel's data
                    console.log('Selected Hotel Data:', hotelData);
        
                    return hotelData;
                }).get();
            } else {
                $('#submitToSheet').hide();
                selectedHotels = [];
            }
        }                

        function formatHotelName(hotelName) {
            if (typeof hotelName !== 'string') return 'N/A';
            return hotelName
                .toUpperCase()
                .replace(/_/g, ' ')
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

        // Function to reset the form and clear all variables
        function resetForm() {
            $('#searchForm')[0].reset(); // Reset the form fields

            // Hide the results box and clear the results
            $('#resultsBox').hide();
            $('#results tbody').empty();

            // Hide the submit button as there are no results
            $('#submitToSheet').hide();

            // Clear all relevant variables
            locationCoordinates = null; // Clear location coordinates
            internalHotelIds = []; // Clear hotel IDs
            selectedHotels = []; // Clear selected hotels

            // Optionally reset any other variables that may be in use
            accessToken = null; // Clear access token
            isSubmitting = false; // Reset the submission flag
            datePicker.clear(); // Clear Flatpickr instance if applicable

            // Clear the form currency
            $('#currency').val(''); // Reset currency selection
        }


        // Click event for submit button
        $('#submitToSheet').on('click', async function() {
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
                priceLimit
            };

            const formattedData = {
                selectedHotels
            };

            try {
                const result = await submitToSheety(formData, formattedData);
                if (result) {
                    alert('Thank you for your submission, we will keep you updated on the lowest prices for your selection!');
                    resetForm(); // Reset form and hide results after submission
        
                    // Wait for 1 seconds before reloading the page
                    setTimeout(function() {
                        window.location.reload(); // Reload the page
                    }, 1000); //
                }
            } catch (error) {
                console.error('Error sending data to Sheety:', error.message);
            } finally {
                // Hide the loading icon after the submission completes
                $('.loader').hide();
            }
        });

        // Attach event listener to all existing checkboxes
        $('#results').on('change', 'input[type="checkbox"]', handleCheckboxChange);

        try {
            const tokenResponse = await fetch(getAccessTokenUrl);
            const tokenData = await tokenResponse.json();
            accessToken = tokenData.access_token;

            const coords = await getLocationCoordinates(location);
            if (!coords || !coords.latitude || !coords.longitude) {
                throw new Error('Invalid coordinates received');
            }
            const { latitude, longitude } = coords;
            const getHotelsByCoordinatesUrlWithParams = `${getHotelsByCoordinatesUrl}&latitude=${latitude}&longitude=${longitude}&radius=5&radiusUnit=KM&hotelSource=ALL`;

            const hotelsResponse = await fetch(getHotelsByCoordinatesUrlWithParams, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            const hotelsData = await hotelsResponse.json();

            const resultsTableBody = $('#results tbody');
            resultsTableBody.empty();

            if (hotelsData && hotelsData.data && hotelsData.data.length > 0) {
                internalHotelIds = hotelsData.data.map(hotel => hotel.hotelId);
                const hotelIds = internalHotelIds.slice(0, limitResults);

                const offersData = await fetchHotelOffers(hotelIds);
                const originalCurrency = offersData.data[0]?.offers[0]?.price?.currency || formCurrency;
                const convertedOffers = await convertPricesToFormCurrency(offersData.data, originalCurrency);
                const filteredOffers = filterOffersByPrice(convertedOffers, priceLimit, numberOfNights);

                if (filteredOffers.length > 0) {
                    filteredOffers.forEach(offer => {
                        const row = $('<tr>');

                        row.append($('<td>').addClass('hiddenHotelId').text(offer.hotel.hotelId).hide());
                        row.append($('<td>').append($('<input>').attr('type', 'checkbox').addClass('select-checkbox')));
                        row.append($('<td>').text(formatHotelName(offer.hotel.name)).addClass('hotel'));
                        row.append($('<td>').text(offer.offers[0].room ? formatRoomType(offer.offers[0].room.typeEstimated.category) : 'N/A').addClass('roomType'));
                        row.append($('<td>').text(offer.pricePerNight ? `${offer.offers[0].price.currency} ${offer.pricePerNight}` : 'N/A').addClass('pricePerNight'));
                        row.append($('<td>').text(offer.offers[0].price ? `${offer.offers[0].price.currency} ${offer.offers[0].price.total}` : 'N/A').addClass('price'));
                        row.append($('<td>').text(`${calculateDistance(locationCoordinates.latitude, locationCoordinates.longitude, offer.hotel.latitude, offer.hotel.longitude)} km`).addClass('distance'));

                        resultsTableBody.append(row);

                    });
                } else {
                    resultsTableBody.html('<tr><td colspan="6">No results found</td></tr>');
                }
                
                $('#resultsBox').show();
            } else {
                $('#resultsBox').show();
                resultsTableBody.html('<tr><td colspan="5">No hotels found</td></tr>');
            }
        } catch (error) {
            console.error('Error:', error.message);
            $('#resultsBox').show();
            $('#results tbody').html(`<tr><td colspan="5">An error occurred: ${error.message}. Please try again.</td></tr>`);
        } finally {
            // Hide the loading icon
            $('.loader').hide();
        }
    });
});
